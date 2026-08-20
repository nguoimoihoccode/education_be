import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Quiz, QuizQuestion, QuizSession } from '../entities';
import {
  StartQuizSessionDto,
  SubmitQuizAnswerDto,
  CompleteQuizSessionDto,
} from '../dto';
import {
  buildQuizSessionQuestionOrder,
  isQuestionInSessionOrder,
  hasAnsweredQuestion,
} from '../domain/quiz-helpers';
import {
  gradeQuizAnswer,
  calculateFinalQuizScore,
} from '../domain/quiz-grading.policy';

@Injectable()
export class QuizSessionService {
  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizQuestion)
    private readonly quizQuestionRepository: Repository<QuizQuestion>,
    @InjectRepository(QuizSession)
    private readonly quizSessionRepository: Repository<QuizSession>,
  ) {}

  // ==================== Quiz Session Management ====================

  async startQuizSession(userId: number, dto: StartQuizSessionDto) {
    const quiz = await this.quizRepository.findOne({
      where: { id: dto.quizId },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (!quiz.isPublic && quiz.userId !== userId) {
      throw new NotFoundException('Quiz not found');
    }

    const completedAttempts = await this.quizSessionRepository.count({
      where: { userId, quizId: dto.quizId, completed: true },
    });

    if (!quiz.allowRetry && completedAttempts > 0) {
      throw new BadRequestException('Quiz does not allow retries');
    }

    if (
      quiz.allowRetry &&
      quiz.maxRetries > 0 &&
      completedAttempts >= quiz.maxRetries
    ) {
      throw new BadRequestException('Quiz retry limit reached');
    }

    // Get questions
    let questions = await this.quizQuestionRepository.find({
      where: { quizId: dto.quizId },
      order: { order: 'ASC' },
    });

    // Shuffle if enabled
    if (quiz.shuffleQuestions) {
      questions = this.shuffleArray(questions);
    }

    // Limit question count
    if (dto.questionCount && dto.questionCount < questions.length) {
      questions = questions.slice(0, dto.questionCount);
    }

    // Shuffle answers if enabled
    if (quiz.shuffleAnswers) {
      questions = questions.map((q) => ({
        ...q,
        options: q.options ? this.shuffleArray(q.options) : q.options,
      }));
    }

    const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

    const session = this.quizSessionRepository.create({
      quizId: dto.quizId,
      userId,
      totalPoints,
      answers: [],
      questionOrder: buildQuizSessionQuestionOrder(questions),
      attemptNumber: await this.getNextAttemptNumber(userId, dto.quizId),
      startedAt: new Date(),
    });

    return this.quizSessionRepository.save(session);
  }

  async submitQuizAnswer(
    userId: number,
    sessionId: string,
    dto: SubmitQuizAnswerDto,
  ) {
    const session = await this.getQuizSession(sessionId, userId);

    if (session.completed) {
      throw new BadRequestException('Quiz session already completed');
    }

    const question = await this.quizQuestionRepository.findOne({
      where: { id: dto.questionId },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (question.quizId !== session.quizId) {
      throw new BadRequestException(
        'Question does not belong to this quiz session',
      );
    }

    if (!isQuestionInSessionOrder(session.questionOrder, dto.questionId)) {
      throw new BadRequestException(
        'Question is not part of this quiz session',
      );
    }

    if (hasAnsweredQuestion(session.answers, dto.questionId)) {
      throw new BadRequestException(
        'Question already answered in this session',
      );
    }

    const gradedAnswer = gradeQuizAnswer({
      correctAnswer: question.correctAnswer,
      userAnswer: dto.answer,
      points: question.points,
    });
    const { isCorrect, points } = gradedAnswer;

    // Update session
    const answers = session.answers || [];
    answers.push({
      questionId: dto.questionId,
      userAnswer: dto.answer,
      isCorrect,
      timeSpent: dto.timeSpent || 0,
      points,
    });

    session.answers = answers;
    session.earnedPoints = answers.reduce((sum, a) => sum + a.points, 0);
    session.correctAnswers = answers.filter((a) => a.isCorrect).length;
    session.wrongAnswers = answers.filter((a) => !a.isCorrect).length;

    await this.quizSessionRepository.save(session);

    // Get quiz to check showCorrectAnswer setting
    const quiz = await this.quizRepository.findOne({
      where: { id: session.quizId },
    });

    return {
      isCorrect,
      points,
      correctAnswer: quiz?.showCorrectAnswer
        ? question.correctAnswer
        : undefined,
      explanation: quiz?.showCorrectAnswer ? question.explanation : undefined,
    };
  }

  async completeQuizSession(userId: number, dto: CompleteQuizSessionDto) {
    const session = await this.getQuizSession(dto.sessionId, userId);

    if (session.completed) {
      throw new BadRequestException('Quiz session already completed');
    }

    session.completed = true;
    session.completedAt = new Date();

    session.score = calculateFinalQuizScore({
      earnedPoints: session.earnedPoints,
      totalPoints: session.totalPoints,
    });

    // Calculate time spent
    const startedAt = new Date(session.startedAt);
    const completedAt = new Date();
    session.timeSpent = Math.floor(
      (completedAt.getTime() - startedAt.getTime()) / 1000,
    );

    // Check if passed
    const quiz = await this.quizRepository.findOne({
      where: { id: session.quizId },
    });
    session.passed = session.score >= (quiz?.passingScore || 0);

    await this.quizSessionRepository.save(session);

    return session;
  }

  async getQuizSession(sessionId: string, userId: number) {
    const session = await this.quizSessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['quiz'],
    });

    if (!session) {
      throw new NotFoundException('Quiz session not found');
    }

    return session;
  }

  async getQuizSessionQuestions(sessionId: string, userId: number) {
    const session = await this.getQuizSession(sessionId, userId);
    const questionIds = session.questionOrder || [];

    if (questionIds.length === 0) {
      return [];
    }

    const questions = await this.quizQuestionRepository.find({
      where: { id: In(questionIds) },
    });
    const questionsById = new Map(
      questions.map((question) => [question.id, question]),
    );

    return questionIds
      .map((questionId) => questionsById.get(questionId))
      .filter((question): question is QuizQuestion => Boolean(question))
      .map((question) => this.toSessionQuestion(question));
  }

  private toSessionQuestion(question: QuizQuestion) {
    return {
      id: question.id,
      question: question.question,
      type: question.type,
      options: question.options,
      points: question.points,
      flashcardId: question.flashcardId,
      quizId: question.quizId,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
  }

  async getQuizSessions(
    userId: number,
    quizId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (quizId) {
      where.quizId = quizId;
    }

    const [sessions, total] = await this.quizSessionRepository.findAndCount({
      where,
      relations: ['quiz'],
      skip,
      take: limit,
      order: { startedAt: 'DESC' },
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

  private async getNextAttemptNumber(
    userId: number,
    quizId: string,
  ): Promise<number> {
    const count = await this.quizSessionRepository.count({
      where: { userId, quizId },
    });
    return count + 1;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
