import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../modules/users/entities/user.entity';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { TokenBlacklist } from '../modules/auth/entities/token-blacklist.entity';
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
  FlashcardDeck,
  Flashcard,
  UserFlashcard,
  ReviewSession,
  Quiz,
  QuizQuestion,
  QuizSession,
  DailyLearningTask,
} from '../modules/education/entities';
import { SoulieFriendship } from '../modules/soulie/entities/friendship.entity';
import { SoulieConversation } from '../modules/soulie/entities/conversation.entity';
import { SoulieMessage } from '../modules/soulie/entities/message.entity';
import { SoulieMoment } from '../modules/soulie/entities/moment.entity';
import { NotificationToken } from '../modules/soulie/entities/notification-token.entity';

const isSupabaseHost = (host?: string) =>
  host?.includes('supabase') || host?.includes('pooler.supabase');

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number.parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'stock_db',
  entities: [
    User,
    RefreshToken,
    TokenBlacklist,
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
    SoulieFriendship,
    SoulieConversation,
    SoulieMessage,
    SoulieMoment,
    NotificationToken,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  ssl: isSupabaseHost(process.env.DB_HOST)
    ? { rejectUnauthorized: false }
    : false,
});
