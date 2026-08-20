import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { Quiz } from '../entities';

export async function getOwnedQuizById(
  quizRepository: Repository<Quiz>,
  quizId: string,
  userId: number,
): Promise<Quiz> {
  const quiz = await quizRepository.findOne({
    where: { id: quizId, userId },
  });

  if (!quiz) {
    throw new NotFoundException('Quiz not found');
  }

  return quiz;
}
