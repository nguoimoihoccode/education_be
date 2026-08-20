import { Injectable } from '@nestjs/common';
import { QuizService } from '../quiz.service';
import { EducationService } from '../education.service';

@Injectable()
export class QuizSessionCompletionService {
  constructor(
    private readonly quizService: QuizService,
    private readonly educationService: EducationService,
  ) {}

  async completeAndUpdatePlan(userId: number, sessionId: string) {
    const result = await this.quizService.completeQuizSession(userId, {
      sessionId,
    });
    await this.educationService.markTodayPlanTasksCompleteByType(
      String(userId),
      ['quick_quiz'],
    );
    await this.educationService.markTodayPlanTasksCompleteByTarget(
      String(userId),
      `/quiz/${result.quizId}`,
    );
    return result;
  }
}
