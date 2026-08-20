import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quiz } from '../entities';
import { CreateQuizDto, UpdateQuizDto } from '../dto';
import { getOwnedQuizById } from '../domain/quiz-ownership';

@Injectable()
export class QuizManagementService {
  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
  ) {}

  // ==================== Quiz Management ====================

  async createQuiz(userId: number, dto: CreateQuizDto) {
    const quiz = this.quizRepository.create({
      ...dto,
      userId,
    });
    return this.quizRepository.save(quiz);
  }

  async getQuizzes(
    userId: number,
    page: number = 1,
    limit: number = 10,
    topic?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (topic) {
      where.topic = topic;
    }

    const [quizzes, total] = await this.quizRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      quizzes,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getQuizById(quizId: string, userId: number) {
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

  async updateQuiz(quizId: string, userId: number, dto: UpdateQuizDto) {
    const quiz = await getOwnedQuizById(this.quizRepository, quizId, userId);
    Object.assign(quiz, dto);
    return this.quizRepository.save(quiz);
  }

  async deleteQuiz(quizId: string, userId: number) {
    const quiz = await getOwnedQuizById(this.quizRepository, quizId, userId);
    await this.quizRepository.remove(quiz);
    return { message: 'Quiz deleted successfully' };
  }

  async getPublicQuizzes(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [quizzes, total] = await this.quizRepository.findAndCount({
      where: { isPublic: true },
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      quizzes,
      total,
      page,
      limit,
      totalPages,
    };
  }
}
