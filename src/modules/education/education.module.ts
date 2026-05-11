import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EducationController } from './education.controller';
import { EducationService } from './education.service';
import { EducationSeederService } from './education-seeder.service';
import { FlashcardController } from './flashcard.controller';
import { FlashcardService } from './flashcard.service';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
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
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([
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
    RolesGuard,
  ],
  exports: [EducationService, FlashcardService, QuizService],
})
export class EducationModule {}
