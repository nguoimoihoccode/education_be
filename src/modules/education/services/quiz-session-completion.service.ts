import { Injectable, Logger } from '@nestjs/common';
import { QuizService } from '../quiz.service';
import { EducationService } from '../education.service';
import { HomeworkService } from '../../school/homework.service';

@Injectable()
export class QuizSessionCompletionService {
  private readonly logger = new Logger(QuizSessionCompletionService.name);

  constructor(
    private readonly quizService: QuizService,
    private readonly educationService: EducationService,
    private readonly homeworkService: HomeworkService,
  ) {}

  async completeAndUpdatePlan(
    userId: number,
    sessionId: string,
    homeworkId?: string,
  ) {
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

    // School bridge (Phase 4): biến điểm quiz 0–100 thành đầu điểm 15 phút
    // nếu quiz đang được giao làm BTVN với countsAsGrade. Best-effort —
    // lỗi phía trường KHÔNG được làm hỏng luồng hoàn thành quiz.
    try {
      await this.homeworkService.recordQuizGrade({
        userId,
        sessionId: result.id ?? sessionId,
        quizId: result.quizId,
        scorePercent: result.score ?? 0,
        homeworkId,
      });
    } catch (error) {
      this.logger.warn(
        `school grade bridge failed for quiz session ${sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return result;
  }
}
