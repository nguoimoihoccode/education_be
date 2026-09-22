import 'dotenv/config';
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
import { EducationActivityLog } from '../modules/activity-log/entities/activity-log.entity';
import { EducationDataExport } from '../modules/data-export/entities/data-export.entity';
import { AiConversation } from '../modules/ai/entities/ai-conversation.entity';
import { AiEmbeddingSettings } from '../modules/ai/entities/ai-embedding-settings.entity';
import { AiKnowledgeChunk } from '../modules/ai/entities/ai-knowledge-chunk.entity';
import { AiMessage } from '../modules/ai/entities/ai-message.entity';
import { AiProviderSettings } from '../modules/ai/entities/ai-provider-settings.entity';
import {
  School,
  AcademicYear,
  Subject,
  SchoolClass,
  TeachingAssignment,
  ClassMembership,
  ParentLink,
  TimeSlot,
  AttendanceRecord,
  GradeEntry,
  HomeworkAssignment,
} from '../modules/school/entities';

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
    EducationActivityLog,
    EducationDataExport,
    // AI tutor, registered for completeness. Nothing at runtime depends on this
    // list — the app builds its own entity set in app.module — and there is no
    // `migration:generate` script here: migrations are written by hand, which is
    // why this file is documented as the current schema's source of truth.
    //
    // Measured, because the intuitive assumption is wrong: `migration:generate`
    // ignores tables it has no entity for rather than proposing to drop them, so
    // leaving these out was harmless. Registering them is what has a cost —
    // `AiKnowledgeChunk` has a `vector` column and an HNSW index that TypeORM
    // cannot express, so a generated diff for it will always show index churn.
    AiConversation,
    AiMessage,
    AiProviderSettings,
    AiEmbeddingSettings,
    AiKnowledgeChunk,
    // School platform entities
    School,
    AcademicYear,
    Subject,
    SchoolClass,
    TeachingAssignment,
    ClassMembership,
    ParentLink,
    TimeSlot,
    AttendanceRecord,
    GradeEntry,
    HomeworkAssignment,
  ],
  migrations:
    process.env.NODE_ENV === 'production'
      ? ['dist/database/migrations/*.js']
      : ['src/database/migrations/*.ts'],
  synchronize: false,
  ssl: isSupabaseHost(process.env.DB_HOST)
    ? { rejectUnauthorized: false }
    : false,
});
