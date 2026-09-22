import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { CacheModule, CACHE_REDIS_CLIENT } from './common/cache/cache.module';
import { RedisThrottlerStorage } from './common/cache/throttler-redis.storage';

// Config
import { configValidationSchema } from './config/config.validation';

// Common
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { HealthController } from './common/health/health.controller';

// App
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Auth
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';

// Feature Modules
import { UsersModule } from './modules/users/users.module';

// Education Module
import { EducationModule } from './modules/education/education.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
import { EducationLeaderboardModule } from './modules/education-leaderboard/education-leaderboard.module';

// Document import
import { DocumentImportModule } from './modules/document-import/document-import.module';
import { DataExportModule } from './modules/data-export/data-export.module';

// AI tutor endpoints
import { AiModule } from './modules/ai/ai.module';

// School platform (docs/SCHOOL_PLATFORM_PLAN.md)
import { SchoolModule } from './modules/school/school.module';

// Entities
import { User } from './modules/users/entities/user.entity';
import { RefreshToken } from './modules/auth/entities/refresh-token.entity';
import { TokenBlacklist } from './modules/auth/entities/token-blacklist.entity';
import { AuthLoginAttempt } from './modules/auth/entities/auth-login-attempt.entity';

// Education Entities
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
} from './modules/education/entities';

import { EducationActivityLog } from './modules/activity-log/entities/activity-log.entity';
import { EducationDataExport } from './modules/data-export/entities/data-export.entity';
import { AiConversation } from './modules/ai/entities/ai-conversation.entity';
import { AiMessage } from './modules/ai/entities/ai-message.entity';
import { AiProviderSettings } from './modules/ai/entities/ai-provider-settings.entity';
import { AiEmbeddingSettings } from './modules/ai/entities/ai-embedding-settings.entity';
import { AiKnowledgeChunk } from './modules/ai/entities/ai-knowledge-chunk.entity';

// School Entities
import {
  School,
  AcademicYear,
  Subject,
  SchoolClass,
  TeachingAssignment,
  ClassMembership,
} from './modules/school/entities';

@Module({
  imports: [
    // Configuration with validation
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: configValidationSchema,
      validationOptions: {
        abortEarly: false, // Show all validation errors
      },
    }),

    // Rate Limiting — with REDIS_URL configured, counters live in Redis so
    // the limits are shared across every backend instance; without it each
    // instance keeps its own in-memory counters.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, CacheModule],
      useFactory: (configService: ConfigService, redisClient: Redis | null) => [
        {
          ttl: configService.get<number>('THROTTLE_TTL', 60) * 1000, // Convert to ms
          limit: configService.get<number>('THROTTLE_LIMIT', 100),
          ...(redisClient
            ? { storage: new RedisThrottlerStorage(redisClient) }
            : {}),
        },
      ],
      inject: [ConfigService, CACHE_REDIS_CLIENT],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_DATABASE', 'stock_db'),
        entities: [
          User,
          RefreshToken,
          TokenBlacklist,
          AuthLoginAttempt,
          // Education entities
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
          AiConversation,
          AiMessage,
          AiProviderSettings,
          AiEmbeddingSettings,
          AiKnowledgeChunk,
          // School entities
          School,
          AcademicYear,
          Subject,
          SchoolClass,
          TeachingAssignment,
          ClassMembership,
        ],
        synchronize:
          configService.get<string>('NODE_ENV') === 'development' &&
          configService.get<boolean>('ALLOW_DB_SYNC', false),
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl:
          configService.get<string>('DB_HOST')?.includes('supabase') ||
          configService.get<string>('DB_HOST')?.includes('pooler.supabase')
            ? { rejectUnauthorized: false }
            : false,
        // Connection pool settings
        extra: {
          max: 20, // Max connections
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        },
      }),
      inject: [ConfigService],
    }),

    // Scheduler for background tasks
    ScheduleModule.forRoot(),

    // Feature Modules
    UsersModule,
    AuthModule,
    EducationModule,
    ActivityLogModule,
    EducationLeaderboardModule,
    DocumentImportModule,
    DataExportModule,
    AiModule,
    SchoolModule,
  ],
  controllers: [
    AppController,
    HealthController, // Health check endpoints
  ],
  providers: [
    AppService,

    // Global Exception Filter
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },

    // Global Logging Interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },

    // Global JWT Auth Guard
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    // Global Rate Limiting Guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
