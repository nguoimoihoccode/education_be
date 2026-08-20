import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Quiz, QuizQuestion, QuizSession } from '../entities';
import {
  buildQuizStatsResult,
  buildTopicQuizStatsResult,
  parseNumericStat,
  uniqueNonEmpty,
} from '../domain/quiz-helpers';
import { AiService } from '../../ai/ai.service';

@Injectable()
export class QuizStatisticsService {
  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizQuestion)
    private readonly quizQuestionRepository: Repository<QuizQuestion>,
    @InjectRepository(QuizSession)
    private readonly quizSessionRepository: Repository<QuizSession>,
    private readonly aiService: AiService,
  ) {}

  // ==================== Statistics & Progress ====================

  async getQuizStats(userId: number) {
    const totalQuizzes = await this.quizRepository.count({
      where: { userId },
    });

    const totalSessions = await this.quizSessionRepository.count({
      where: { userId, completed: true },
    });

    const scoreStats = await this.quizSessionRepository
      .createQueryBuilder('s')
      .select('AVG(s.score)', 'average')
      .addSelect('MAX(s.score)', 'highest')
      .addSelect('MIN(s.score)', 'lowest')
      .addSelect(
        'AVG(s.timeSpent::float / NULLIF(s.correctAnswers + s.wrongAnswers + s.skippedAnswers, 0))',
        'averageTimePerQuestion',
      )
      .where('s.userId = :userId', { userId })
      .andWhere('s.completed = :completed', { completed: true })
      .getRawOne();

    const passedSessions = await this.quizSessionRepository.count({
      where: { userId, completed: true, passed: true },
    });

    const passRate =
      totalSessions > 0 ? (passedSessions / totalSessions) * 100 : 0;

    const quizzes = await this.quizRepository.find({ where: { userId } });

    return buildQuizStatsResult({
      totalQuizzes,
      totalSessions,
      averageScore: parseNumericStat(scoreStats?.average),
      highestScore: parseNumericStat(scoreStats?.highest),
      lowestScore: parseNumericStat(scoreStats?.lowest),
      averageTimePerQuestion: parseNumericStat(
        scoreStats?.averageTimePerQuestion,
      ),
      passRate: Math.round(passRate),
      watchedTopics: uniqueNonEmpty(quizzes.map((quiz) => quiz.topic)),
    });
  }

  async getQuizStatsByTopic(userId: number, topic: string) {
    const quizzes = await this.quizRepository.find({
      where: { userId, topic },
    });

    const quizIds = quizzes.map((q) => q.id);

    if (quizIds.length === 0) {
      return buildTopicQuizStatsResult({
        topic,
        totalQuizzes: 0,
        totalSessions: 0,
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        passRate: 0,
        favoriteQuestionTypes: [],
      });
    }

    const totalSessions = await this.quizSessionRepository.count({
      where: { userId, quizId: In(quizIds), completed: true },
    });

    const scoreStats = await this.quizSessionRepository
      .createQueryBuilder('s')
      .select('AVG(s.score)', 'average')
      .addSelect('MAX(s.score)', 'highest')
      .addSelect('MIN(s.score)', 'lowest')
      .where('s.userId = :userId', { userId })
      .andWhere('s.quizId IN (:...quizIds)', { quizIds })
      .andWhere('s.completed = :completed', { completed: true })
      .getRawOne();

    const passedSessions = await this.quizSessionRepository.count({
      where: { userId, quizId: In(quizIds), completed: true, passed: true },
    });

    const passRate =
      totalSessions > 0 ? (passedSessions / totalSessions) * 100 : 0;

    return buildTopicQuizStatsResult({
      topic,
      totalQuizzes: quizzes.length,
      totalSessions,
      averageScore: parseNumericStat(scoreStats?.average),
      highestScore: parseNumericStat(scoreStats?.highest),
      lowestScore: parseNumericStat(scoreStats?.lowest),
      passRate: Math.round(passRate),
      favoriteQuestionTypes: uniqueNonEmpty(
        quizzes.map((quiz) => quiz.questionType),
      ),
    });
  }

  async getQuizHistory(userId: number, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [sessions, total] = await this.quizSessionRepository.findAndCount({
      where: { userId, completed: true },
      relations: ['quiz'],
      skip,
      take: limit,
      order: { completedAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      sessions,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getWrongAnswers(userId: number, sessionId?: string) {
    const where: any = { userId, completed: true };

    if (sessionId) {
      where.id = sessionId;
    }

    const sessions = await this.quizSessionRepository.find({
      where,
      relations: ['quiz'],
    });

    const wrongAnswers: any[] = [];

    for (const session of sessions) {
      if (session.answers) {
        for (const answer of session.answers) {
          if (!answer.isCorrect) {
            const question = await this.quizQuestionRepository.findOne({
              where: { id: answer.questionId },
            });
            if (question) {
              wrongAnswers.push({
                sessionId: session.id,
                quizName: session.quiz.name,
                question: question.question,
                userAnswer: answer.userAnswer,
                correctAnswer: question.correctAnswer,
                explanation: question.explanation,
                timeSpent: answer.timeSpent,
              });
            }
          }
        }
      }
    }

    await this.fillMissingWrongAnswerExplanations(wrongAnswers);

    return {
      wrongAnswers,
      total: wrongAnswers.length,
    };
  }

  private async fillMissingWrongAnswerExplanations(
    wrongAnswers: Array<{
      question: string;
      userAnswer: string;
      correctAnswer: string;
      explanation?: string | null;
    }>,
  ): Promise<void> {
    const needsExplanation = wrongAnswers
      .filter((item) => !item.explanation?.trim())
      .slice(0, 5);

    await Promise.all(
      needsExplanation.map(async (item) => {
        try {
          const text = await this.aiService.completeText({
            system:
              'Write a short, clear quiz explanation (1-2 sentences) for a wrong answer. No markdown.',
            user: JSON.stringify({
              question: item.question,
              userAnswer: item.userAnswer,
              correctAnswer: item.correctAnswer,
            }),
          });
          const explanation = (text || '').trim();
          if (explanation) {
            item.explanation = explanation;
          }
        } catch {
          // fail soft — leave explanation empty
        }
      }),
    );
  }

  async getLeaderboard(quizId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [sessions, total] = await this.quizSessionRepository.findAndCount({
      where: { quizId, completed: true },
      relations: ['user'],
      skip,
      take: limit,
      order: { score: 'DESC', timeSpent: 'ASC' },
    });

    const totalPages = Math.ceil(total / limit);

    const leaderboard = sessions.map((session, index) => ({
      rank: skip + index + 1,
      userId: session.userId,
      username: session.user.email,
      score: session.score,
      timeSpent: session.timeSpent,
      completedAt: session.completedAt,
    }));

    return {
      leaderboard,
      total,
      page,
      limit,
      totalPages,
    };
  }
}
