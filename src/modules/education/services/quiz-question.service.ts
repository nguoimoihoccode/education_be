import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quiz, QuizQuestion } from '../entities';
import {
  CreateQuizQuestionDto,
  BulkCreateQuizQuestionDto,
  UpdateQuizQuestionDto,
} from '../dto';
import { getOwnedQuizById } from '../domain/quiz-ownership';

@Injectable()
export class QuizQuestionService {
  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizQuestion)
    private readonly quizQuestionRepository: Repository<QuizQuestion>,
  ) {}

  // ==================== Quiz Question Management ====================

  private async getViewableQuizById(quizId: string, userId: number) {
    const quiz = await this.quizRepository.findOne({
      where: { id: quizId },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (!quiz.isPublic && quiz.userId !== userId) {
      throw new NotFoundException('Quiz not found');
    }

    return quiz;
  }

  async createQuizQuestion(
    userId: number,
    quizId: string,
    dto: CreateQuizQuestionDto,
  ) {
    const quiz = await getOwnedQuizById(this.quizRepository, quizId, userId);

    const question = this.quizQuestionRepository.create({
      ...dto,
      quizId,
      order: quiz.questionCount,
    });

    const savedQuestion = await this.quizQuestionRepository.save(question);

    // Update quiz question count
    await this.quizRepository.increment({ id: quizId }, 'questionCount', 1);

    return savedQuestion;
  }

  async bulkCreateQuizQuestions(
    userId: number,
    quizId: string,
    dto: BulkCreateQuizQuestionDto,
  ) {
    const quiz = await this.getViewableQuizById(quizId, userId);

    const created = [];
    for (let i = 0; i < dto.questions.length; i++) {
      const question = this.quizQuestionRepository.create({
        ...dto.questions[i],
        quizId,
        order: quiz.questionCount + i,
      });
      const saved = await this.quizQuestionRepository.save(question);
      created.push(saved);
    }

    // Update quiz question count
    await this.quizRepository.increment(
      { id: quizId },
      'questionCount',
      created.length,
    );

    return {
      created,
      total: created.length,
    };
  }

  async getQuizQuestions(quizId: string, userId: number) {
    const quiz = await this.getViewableQuizById(quizId, userId);

    const questions = await this.quizQuestionRepository.find({
      where: { quizId },
      order: { order: 'ASC' },
    });

    return {
      quiz,
      questions,
    };
  }

  async updateQuizQuestion(
    questionId: string,
    userId: number,
    dto: UpdateQuizQuestionDto,
  ) {
    const question = await this.quizQuestionRepository.findOne({
      where: { id: questionId },
      relations: ['quiz'],
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (question.quiz.userId !== userId) {
      throw new BadRequestException(
        'You do not have permission to update this question',
      );
    }

    Object.assign(question, dto);
    return this.quizQuestionRepository.save(question);
  }

  async deleteQuizQuestion(questionId: string, userId: number) {
    const question = await this.quizQuestionRepository.findOne({
      where: { id: questionId },
      relations: ['quiz'],
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (question.quiz.userId !== userId) {
      throw new BadRequestException(
        'You do not have permission to delete this question',
      );
    }

    const quizId = question.quizId;
    await this.quizQuestionRepository.remove(question);

    // Update quiz question count
    await this.quizRepository.decrement({ id: quizId }, 'questionCount', 1);

    return { message: 'Question deleted successfully' };
  }
}
