# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a NestJS backend application that provides REST APIs for the Soulie social platform and Education language learning platform.

## Development Commands

```bash
# Development with hot reload
npm run start:dev

# Build for production
npm run build

# Production server
npm run start:prod

# Database migrations
npm run migration:run      # Run pending migrations
npm run migration:revert   # Revert last migration
npm run migration:show    # Show migration status

# Generate JWT RSA keys (required for auth)
npm run generate:jwt-keys

# Testing
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:cov          # Coverage report
npm run test:e2e          # End-to-end tests

# Code quality
npm run lint              # ESLint with auto-fix
npm run format            # Prettier formatting
```

## Architecture

### Module Structure

The application follows NestJS modular architecture with feature-based organization:

**Core Modules:**
- `auth` - JWT authentication with RS256, refresh tokens, Google OAuth
- `users` - User management and profiles

**Feature Modules:**
- `education` - Language learning platform with courses, lessons, vocabulary
- `soulie` - Social features (friendships, conversations, messages, moments)
- `media` - File upload and media management

### Soulie Module

**Entities:**
- `SoulieFriendship` - User friendship relationships
- `SoulieConversation` - Chat conversations between users
- `SoulieMessage` - Messages within conversations
- `SoulieMoment` - User moments/posts
- `NotificationToken` - Push notification tokens

**Key Features:**
- Friend request system with acceptance/rejection
- Real-time messaging through conversations
- Moment sharing with media attachments
- Push notification support

**Key Files:**
- `src/modules/soulie/soulie.controller.ts` - REST API endpoints
- `src/modules/soulie/soulie.service.ts` - Business logic
- `src/modules/soulie/entities/` - Database entities

### Education Module

**Entities:**
- `Language` - Supported languages
- `Course` - Language courses
- `Lesson` - Course lessons
- `Vocabulary` - Vocabulary items
- `Exercise` - Practice exercises
- `UserCourse` - User course enrollment
- `UserLesson` - User lesson progress
- `UserVocabulary` - User vocabulary learning
- `UserStreak` - Learning streak tracking

**Key Features:**
- Multi-language learning platform
- Structured courses with lessons
- Vocabulary management and tracking
- Exercise system for practice
- User progress tracking with streaks

**Key Files:**
- `src/modules/education/education.controller.ts` - REST API endpoints
- `src/modules/education/education.service.ts` - Business logic
- `src/modules/education/entities/` - Database entities

### Common Layer

Located in `src/common/`:
- `guards/` - JWT auth guard, roles guard
- `filters/` - Global exception filter
- `interceptors/` - Logging interceptor
- `middlewares/` - CORS middleware
- `decorators/` - Custom decorators
- `pipes/` - Validation pipes
- `utils/` - Utility functions
- `health/` - Health check endpoints

### Database Layer

- **ORM**: TypeORM with PostgreSQL
- **Migrations**: Located in `src/database/migrations/`
- **Seeders**: Located in `src/database/seeders/`
- **Data Source**: Configured in `src/database/data-source.ts`

Entities are defined within each module's `entities/` directory and registered in `app.module.ts`.

### Authentication System

**JWT Implementation:**
- Uses RS256 (asymmetric encryption) with RSA key pair
- Access tokens: 15 minutes expiry
- Refresh tokens: 7 days expiry with automatic rotation
- Token blacklist for immediate revocation
- Device fingerprinting for session tracking

**Key Files:**
- `src/modules/auth/auth.service.ts` - Core auth logic
- `src/modules/auth/jwt.strategy.ts` - JWT access token strategy
- `src/modules/auth/jwt-refresh.strategy.ts` - JWT refresh token strategy
- `src/modules/auth/google.strategy.ts` - Google OAuth strategy
- `src/modules/auth/jwt-key.service.ts` - RSA key management

**Key Generation:**
```bash
npm run generate:jwt-keys
# Creates keys/private.pem and keys/public.pem
```

**Important Security Notes:**
- `keys/private.pem` is never committed to git
- Refresh tokens rotate on each use (old token is revoked)
- Device fingerprint validation prevents token reuse
- Token blacklist allows immediate revocation

### Configuration

Environment variables are validated using Joi schema in `src/config/config.validation.ts`.

**Required Environment Variables:**
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=yourpassword
DB_DATABASE=your_database_name

# Server
PORT=3000
NODE_ENV=development

# Frontend
FRONTEND_URL=http://localhost:5173
```

**Optional Variables:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` - Google OAuth
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` - Supabase integration
- `MEDIA_STORAGE_PATH`, `MEDIA_PUBLIC_BASE_URL` - Media upload configuration
- `THROTTLE_TTL`, `THROTTLE_LIMIT` - Rate limiting

### API Documentation

Swagger UI is available at `/api` when the server is running.

### Global Middleware

The application uses several global providers configured in `app.module.ts`:
- `AllExceptionsFilter` - Centralized error handling
- `LoggingInterceptor` - Request/response logging
- `JwtAuthGuard` - JWT authentication on all routes (except public auth endpoints)
- `ThrottlerGuard` - Rate limiting

### Testing Structure

- `test/unit/` - Unit tests
- `test/integration/` - Integration tests
- `test/e2e/` - End-to-end tests

Tests use Jest with ts-jest transformer. Test files follow `*.spec.ts` naming convention.

### Scheduled Tasks

The application uses `@nestjs/schedule` for background tasks:
- Token cleanup (expired refresh tokens and blacklist entries)
- Scheduled in `src/modules/auth/tasks/token-cleanup.task.ts`

## Database Setup

```bash
# Create PostgreSQL database
psql -U postgres
CREATE DATABASE your_database_name;
\q

# Run migrations
npm run migration:run

# Verify migration status
npm run migration:show
```

## Common Patterns

### Module Structure

Each feature module typically contains:
- `*.module.ts` - Module definition with imports/providers/controllers
- `*.controller.ts` - REST API endpoints
- `*.service.ts` - Business logic
- `dto/` - Data transfer objects (request/response)
- `entities/` - TypeORM entities

### DTO Validation

DTOs use `class-validator` decorators:
```typescript
export class CreateLessonDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsNumber()
  @IsPositive()
  courseId: number;
}
```

### Entity Relationships

Entities use TypeORM decorators for relationships:
- `@OneToMany`, `@ManyToOne`, `@OneToOne`, `@ManyToMany`
- Cascade options for automatic related entity operations
- Join columns for foreign key relationships

### Error Handling

All exceptions are caught by the global `AllExceptionsFilter` which returns consistent error responses:
```typescript
{
  statusCode: number,
  message: string,
  error: string,
  timestamp: string,
  path: string
}
```

### Public Routes

Routes that bypass JWT auth are marked with `@Public()` decorator from `src/common/decorators/public.decorator`.

## Important Notes

- The application uses TypeORM with PostgreSQL
- All routes are protected by JWT auth except public auth endpoints
- Refresh tokens must be rotated (old tokens are revoked after use)
- Device fingerprinting is used for session validation
- Rate limiting is applied globally (configurable via env vars)
- CORS is configured to allow requests from the frontend URL
- Swagger documentation is auto-generated from controller decorators
- Education module supports multi-language learning with courses, lessons, and vocabulary
- Soulie module provides social features including friendships, conversations, and media sharing
- Media module handles file uploads for moments and other features
