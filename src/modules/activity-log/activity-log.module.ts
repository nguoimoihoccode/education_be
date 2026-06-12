import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizSession } from '../education/entities/quiz-session.entity';
import { ReviewSession } from '../education/entities/review-session.entity';
import { UserLesson } from '../education/entities/user-lesson.entity';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from './activity-log.service';
import { EducationActivityLog } from './entities/activity-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EducationActivityLog,
      UserLesson,
      QuizSession,
      ReviewSession,
    ]),
  ],
  controllers: [ActivityLogController],
  providers: [ActivityLogService],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
