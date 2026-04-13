import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

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

// Soulie social endpoints
import { SoulieModule } from './modules/soulie/soulie.module';

// Soulie media uploads
import { MediaModule } from './modules/media/media.module';

// Document import
import { DocumentImportModule } from './modules/document-import/document-import.module';

// Entities
import { User } from './modules/users/entities/user.entity';
import { RefreshToken } from './modules/auth/entities/refresh-token.entity';
import { TokenBlacklist } from './modules/auth/entities/token-blacklist.entity';

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
} from './modules/education/entities';

// Soulie Entities
import { SoulieFriendship } from './modules/soulie/entities/friendship.entity';
import { SoulieConversation } from './modules/soulie/entities/conversation.entity';
import { SoulieMessage } from './modules/soulie/entities/message.entity';
import { SoulieMoment } from './modules/soulie/entities/moment.entity';
import { NotificationToken } from './modules/soulie/entities/notification-token.entity';

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

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('THROTTLE_TTL', 60) * 1000, // Convert to ms
          limit: configService.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
      inject: [ConfigService],
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
          // Soulie entities
          SoulieFriendship,
          SoulieConversation,
          SoulieMessage,
          SoulieMoment,
          NotificationToken,
        ],
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
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
    SoulieModule,
    MediaModule,
    DocumentImportModule,
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
