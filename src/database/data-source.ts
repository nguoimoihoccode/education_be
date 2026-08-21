import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../modules/users/entities/user.entity';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { TokenBlacklist } from '../modules/auth/entities/token-blacklist.entity';
import { AuthLoginAttempt } from '../modules/auth/entities/auth-login-attempt.entity';
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
import { EducationSocialPost } from '../modules/education-social/entities/social-post.entity';
import { EducationSocialComment } from '../modules/education-social/entities/social-comment.entity';
import { EducationSocialPostLike } from '../modules/education-social/entities/social-post-like.entity';
import { EducationSocialPostBookmark } from '../modules/education-social/entities/social-post-bookmark.entity';
import { EducationActivityLog } from '../modules/activity-log/entities/activity-log.entity';
import { EducationDataExport } from '../modules/data-export/entities/data-export.entity';

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
    AuthLoginAttempt,
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
    EducationSocialPost,
    EducationSocialComment,
    EducationSocialPostLike,
    EducationSocialPostBookmark,
    EducationActivityLog,
    EducationDataExport,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  ssl: isSupabaseHost(process.env.DB_HOST)
    ? { rejectUnauthorized: false }
    : false,
});
