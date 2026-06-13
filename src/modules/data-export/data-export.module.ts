import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { UserCourse } from '../education/entities/user-course.entity';
import { UserLesson } from '../education/entities/user-lesson.entity';
import { FlashcardDeck } from '../education/entities/flashcard-deck.entity';
import { Flashcard } from '../education/entities/flashcard.entity';
import { ReviewSession } from '../education/entities/review-session.entity';
import { QuizSession } from '../education/entities/quiz-session.entity';
import { EducationSocialPost } from '../education-social/entities/social-post.entity';
import { EducationSocialComment } from '../education-social/entities/social-comment.entity';
import { User } from '../users/entities/user.entity';
import { EducationDataExport } from './entities/data-export.entity';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';

@Module({
  imports: [
    ConfigModule,
    ActivityLogModule,
    TypeOrmModule.forFeature([
      User,
      UserCourse,
      UserLesson,
      FlashcardDeck,
      Flashcard,
      ReviewSession,
      QuizSession,
      EducationSocialPost,
      EducationSocialComment,
      EducationDataExport,
    ]),
  ],
  controllers: [DataExportController],
  providers: [DataExportService],
  exports: [DataExportService],
})
export class DataExportModule {}
