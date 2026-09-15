import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EducationController } from './education.controller';
import { EducationService } from './education.service';
import { EducationSeederService } from './education-seeder.service';
import { FlashcardController } from './flashcard.controller';
import { FlashcardService } from './flashcard.service';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { QuizSessionCompletionService } from './services/quiz-session-completion.service';
import {
  Language,
  Course,
  Lesson,
  Vocabulary,
  Exercise,
  UserCourse,
  UserLesson,
  UserVocabulary,
  UserStreak,
  DailyLearningTask,
} from './entities';
import {
  FlashcardDeck,
  Flashcard,
  UserFlashcard,
  ReviewSession,
} from './entities';
import { Quiz, QuizQuestion, QuizSession } from './entities';

import { RolesGuard } from '../../common/guards/roles.guard';
import { CacheModule } from '../../common/cache/cache.module';
import { UsersModule } from '../users/users.module';
import { AiModule } from '../ai/ai.module';
import { SchoolModule } from '../school/school.module';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    UsersModule,
    AiModule,
    CacheModule,
    // Phase 4 cầu nối quiz→điểm: HomeworkService (best-effort, xem
    // QuizSessionCompletionService). SchoolModule KHÔNG import lại
    // EducationModule → không có cycle.
    SchoolModule,
    TypeOrmModule.forFeature([
      User,
      Language,
      Course,
      Lesson,
      Vocabulary,
      Exercise,
      UserCourse,
      UserLesson,
      UserVocabulary,
      UserStreak,
      FlashcardDeck,
      Flashcard,
      UserFlashcard,
      ReviewSession,
      Quiz,
      QuizQuestion,
      QuizSession,
      DailyLearningTask,
    ]),
  ],
  controllers: [EducationController, FlashcardController, QuizController],
  providers: [
    EducationService,
    EducationSeederService,
    FlashcardService,
    QuizService,
    QuizSessionCompletionService,
    RolesGuard,
  ],
  exports: [EducationService, FlashcardService, QuizService],
})
export class EducationModule {}
