# Education Platform - Implementation Roadmap

## Tổng quan

Dựa trên codebase NestJS hiện có, chúng ta sẽ xây dựng Education Platform theo 4 phases.

---

## Phase 1: Foundation (Week 1-2)

### 1.1. Database Setup

**Priority: CRITICAL**

```bash
# 1. Update User entity
src/modules/users/entities/user.entity.ts
```

**Changes needed:**
```typescript
// Add new columns
@Column({ type: 'varchar', length: 20, default: 'student' })
role: 'student' | 'lecturer' | 'admin';

@Column({ type: 'varchar', length: 255 })
full_name: string;

@Column({ type: 'varchar', length: 50, nullable: true, unique: true })
student_code?: string;

@Column({ type: 'varchar', length: 50, nullable: true, unique: true })
lecturer_code?: string;

// ... other fields from database design
```

**Tasks:**
- [ ] Update user.entity.ts
- [ ] Create migration for new user columns
- [ ] Run migration on dev database
- [ ] Update seed data

### 1.2. Role-Based Access Control (RBAC)

**Create:**

```bash
# 1. Enum
src/common/enums/role.enum.ts

# 2. Decorator
src/common/decorators/roles.decorator.ts

# 3. Guard
src/common/guards/roles.guard.ts

# 4. Current user decorator
src/common/decorators/current-user.decorator.ts
```

**Example files:**

**role.enum.ts:**
```typescript
export enum Role {
  STUDENT = 'student',
  LECTURER = 'lecturer',
  ADMIN = 'admin',
}
```

**roles.decorator.ts:**
```typescript
import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

**roles.guard.ts:**
```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!requiredRoles) {
      return true;
    }
    
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.role === role);
  }
}
```

**current-user.decorator.ts:**
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    
    return data ? user?.[data] : user;
  },
);
```

**Tasks:**
- [ ] Create enum, decorators, guards
- [ ] Register RolesGuard globally in app.module.ts
- [ ] Test with sample endpoints
- [ ] Update auth service to include role in JWT payload

### 1.3. File Upload Module

**Create:**
```bash
src/modules/file-upload/
├── file-upload.module.ts
├── file-upload.controller.ts
├── file-upload.service.ts
├── dto/
│   └── upload-file.dto.ts
└── strategies/
    ├── upload.strategy.interface.ts
    ├── s3-upload.strategy.ts
    └── supabase-upload.strategy.ts
```

**Dependencies:**
```bash
npm install @aws-sdk/client-s3 @supabase/storage-js multer
npm install -D @types/multer
```

**Tasks:**
- [ ] Create file upload module
- [ ] Implement S3 strategy
- [ ] Implement Supabase storage strategy
- [ ] Add file validation (size, type)
- [ ] Test file upload/download

---

## Phase 2: Core Modules (Week 3-4)

### 2.1. Courses Module

**Create:**
```bash
src/modules/courses/
├── courses.module.ts
├── courses.controller.ts
├── courses.service.ts
├── entities/
│   ├── course.entity.ts
│   └── course-enrollment.entity.ts
└── dto/
    ├── create-course.dto.ts
    ├── update-course.dto.ts
    ├── enroll-course.dto.ts
    └── course-query.dto.ts
```

**API Endpoints:**
- [ ] POST /courses - Create course (Lecturer)
- [ ] GET /courses - List courses (All)
- [ ] GET /courses/:id - Get course details (All)
- [ ] PUT /courses/:id - Update course (Lecturer/Owner)
- [ ] DELETE /courses/:id - Delete course (Lecturer/Owner)
- [ ] POST /courses/:id/enroll - Enroll (Student)
- [ ] GET /courses/:id/students - List students (Lecturer)
- [ ] GET /my/courses - My enrolled courses (Student)

**Tasks:**
- [ ] Create entities
- [ ] Create DTOs with validation
- [ ] Implement service layer
- [ ] Implement controller with RBAC
- [ ] Write unit tests
- [ ] Write integration tests

### 2.2. Lessons Module

**Create:**
```bash
src/modules/lessons/
├── lessons.module.ts
├── lessons.controller.ts
├── lessons.service.ts
├── entities/
│   ├── lesson.entity.ts
│   ├── lesson-material.entity.ts
│   └── lesson-progress.entity.ts
└── dto/
    ├── create-lesson.dto.ts
    ├── update-lesson.dto.ts
    ├── create-material.dto.ts
    └── update-progress.dto.ts
```

**API Endpoints:**
- [ ] POST /courses/:id/lessons - Create lesson (Lecturer)
- [ ] GET /courses/:id/lessons - List lessons (All)
- [ ] GET /lessons/:id - Get lesson (All)
- [ ] PUT /lessons/:id - Update lesson (Lecturer)
- [ ] DELETE /lessons/:id - Delete lesson (Lecturer)
- [ ] POST /lessons/:id/materials - Upload material (Lecturer)
- [ ] POST /lessons/:id/progress - Update progress (Student)
- [ ] GET /lessons/:id/progress - Get my progress (Student)

**Tasks:**
- [ ] Create entities
- [ ] Implement lesson CRUD
- [ ] Integrate file upload for materials
- [ ] Implement progress tracking
- [ ] Test video streaming
- [ ] Test PDF viewing

---

## Phase 3: Exam System (Week 5-6)

### 3.1. Setup Redis

**Install:**
```bash
npm install ioredis
npm install -D @types/ioredis
```

**Configure:**
```typescript
// src/config/redis.config.ts
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const redisProvider = {
  provide: 'REDIS_CLIENT',
  useFactory: (configService: ConfigService) => {
    return new Redis({
      host: configService.get('REDIS_HOST', 'localhost'),
      port: configService.get('REDIS_PORT', 6379),
      password: configService.get('REDIS_PASSWORD'),
    });
  },
  inject: [ConfigService],
};
```

**Tasks:**
- [ ] Install Redis locally / cloud
- [ ] Configure Redis module
- [ ] Test connection
- [ ] Update .env.example

### 3.2. Setup Queue System (BullMQ)

**Install:**
```bash
npm install @nestjs/bull bull
npm install -D @types/bull
```

**Configure:**
```typescript
// app.module.ts
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
    // ... other modules
  ],
})
```

**Tasks:**
- [ ] Configure BullMQ
- [ ] Create grading queue
- [ ] Test queue processing

### 3.3. Exams Module

**Create:**
```bash
src/modules/exams/
├── exams.module.ts
├── exams.controller.ts
├── exams.service.ts
├── entities/
│   ├── exam.entity.ts
│   ├── question.entity.ts
│   ├── question-bank.entity.ts
│   ├── exam-question.entity.ts
│   ├── exam-attempt.entity.ts
│   └── exam-answer.entity.ts
├── services/
│   ├── exam-generation.service.ts
│   ├── exam-session.service.ts
│   └── exam-validation.service.ts
└── dto/
    ├── create-exam.dto.ts
    ├── create-question.dto.ts
    ├── start-exam.dto.ts
    ├── save-answer.dto.ts
    └── submit-exam.dto.ts
```

**API Endpoints (Student):**
- [ ] GET /exams - List available exams
- [ ] POST /exams/:id/start - Start exam
- [ ] POST /exams/attempts/:id/answer - Save answer
- [ ] POST /exams/attempts/:id/submit - Submit exam
- [ ] GET /exams/attempts/:id/result - View result

**API Endpoints (Lecturer):**
- [ ] POST /question-banks - Create question bank
- [ ] POST /question-banks/:id/questions - Add question
- [ ] POST /courses/:id/exams - Create exam
- [ ] GET /exams/:id/attempts - View all attempts
- [ ] GET /exams/:id/analytics - Exam statistics

**Tasks:**
- [ ] Create all entities
- [ ] Implement question bank management
- [ ] Implement exam creation
- [ ] Implement exam taking flow (with Redis session)
- [ ] Implement question/option shuffling
- [ ] Test concurrent exam sessions

### 3.4. Grading Module

**Create:**
```bash
src/modules/grading/
├── grading.module.ts
├── grading.controller.ts
├── grading.service.ts
├── entities/
│   ├── grade.entity.ts
│   └── grade-history.entity.ts
├── processors/
│   ├── auto-grading.processor.ts
│   └── manual-grading.processor.ts
└── dto/
    ├── grade-attempt.dto.ts
    └── export-grades.dto.ts
```

**Tasks:**
- [ ] Implement auto-grading for MCQ
- [ ] Implement auto-grading for fill-blank
- [ ] Implement manual grading for essay
- [ ] Create background job processors
- [ ] Implement grade calculation
- [ ] Implement grade export (Excel/CSV)
- [ ] Test grading accuracy

---

## Phase 4: Additional Features (Week 7-8)

### 4.1. Notifications Module

**Create:**
```bash
src/modules/notifications/
├── notifications.module.ts
├── notifications.controller.ts
├── notifications.service.ts
├── entities/
│   └── notification.entity.ts
├── gateways/
│   └── notifications.gateway.ts
└── dto/
    ├── create-notification.dto.ts
    └── notification-query.dto.ts
```

**Install WebSocket:**
```bash
npm install @nestjs/websockets @nestjs/platform-socket.io
npm install -D @types/socket.io
```

**Tasks:**
- [ ] Create notification entity
- [ ] Implement notification service
- [ ] Setup WebSocket gateway
- [ ] Integrate with grading system
- [ ] Test real-time notifications
- [ ] Add email notifications (optional)

### 4.2. Analytics Module (Extend existing)

**Create:**
```bash
src/modules/analytics/
└── education-analytics.service.ts
```

**Analytics to implement:**
- [ ] Student progress dashboard
- [ ] Course completion rates
- [ ] Exam statistics
- [ ] Lecturer performance metrics
- [ ] System usage statistics

### 4.3. Admin Module

**Create:**
```bash
src/modules/admin/
├── admin.module.ts
├── admin.controller.ts
├── admin.service.ts
└── dto/
    ├── update-user-role.dto.ts
    └── system-stats.dto.ts
```

**Tasks:**
- [ ] User management APIs
- [ ] Role assignment
- [ ] System dashboard
- [ ] Audit log viewer
- [ ] Data export features

---

## Technical Tasks (Ongoing)

### Testing

**Unit Tests:**
```bash
# Test each service
npm run test

# Coverage goal: >80%
npm run test:cov
```

**Tasks:**
- [ ] Write unit tests for all services
- [ ] Write unit tests for critical utilities
- [ ] Mock external dependencies
- [ ] Achieve >80% coverage

**Integration Tests:**
```bash
npm run test:e2e
```

**Tasks:**
- [ ] Test complete exam flow
- [ ] Test grading workflow
- [ ] Test file upload/download
- [ ] Test authentication/authorization
- [ ] Test concurrent users

### Documentation

**Tasks:**
- [ ] Update Swagger docs for all endpoints
- [ ] Create Postman collection
- [ ] Write API usage examples
- [ ] Document deployment process
- [ ] Create user guides (Student/Lecturer/Admin)

### Performance Optimization

**Tasks:**
- [ ] Add database indexes (already designed)
- [ ] Implement caching strategy (Redis)
- [ ] Optimize heavy queries
- [ ] Add pagination to all lists
- [ ] Implement lazy loading for relations
- [ ] Profile and optimize slow endpoints

### Security Hardening

**Tasks:**
- [ ] Enable CORS properly
- [ ] Add rate limiting per endpoint
- [ ] Validate all inputs thoroughly
- [ ] Sanitize user-generated content
- [ ] Implement CSRF protection
- [ ] Add security headers (Helmet.js)
- [ ] Regular security audits

---

## Deployment Checklist

### Infrastructure Setup

**Development:**
- [ ] Local PostgreSQL
- [ ] Local Redis
- [ ] Local S3 (MinIO) or Supabase storage

**Staging:**
- [ ] Staging database (Supabase)
- [ ] Staging Redis (Upstash / AWS ElastiCache)
- [ ] Staging S3 bucket
- [ ] CI/CD pipeline to staging

**Production:**
- [ ] Production database with backups
- [ ] Production Redis cluster
- [ ] Production S3 with CDN
- [ ] Load balancer
- [ ] Monitoring & alerts
- [ ] CI/CD pipeline to production

### Environment Variables

```bash
# .env
NODE_ENV=production

# Database
DB_HOST=
DB_PORT=5432
DB_USERNAME=
DB_PASSWORD=
DB_DATABASE=

# Redis
REDIS_HOST=
REDIS_PORT=6379
REDIS_PASSWORD=

# File Storage
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=

# Or Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# JWT (already have keys/)
# Application
MAX_FILE_UPLOAD_SIZE=104857600  # 100MB
ALLOWED_VIDEO_FORMATS=mp4,avi,mov
ALLOWED_DOCUMENT_FORMATS=pdf,ppt,pptx,doc,docx

# Email (optional)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
```

**Tasks:**
- [ ] Set up all environments
- [ ] Configure secrets management
- [ ] Test all integrations
- [ ] Create deployment scripts

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|-----------------|
| Phase 1 | Week 1-2 | RBAC, File Upload, Database |
| Phase 2 | Week 3-4 | Courses, Lessons, Progress |
| Phase 3 | Week 5-6 | Exams, Grading, Queue |
| Phase 4 | Week 7-8 | Notifications, Analytics, Admin |

**Total:** 8 weeks for core features

---

## Future Enhancements (Post-MVP)

### Phase 5: Advanced Features

**AI Features:**
- [ ] Auto-grading for essays using AI (OpenAI API)
- [ ] Plagiarism detection
- [ ] Personalized course recommendations
- [ ] Chatbot for student support

**Mobile App:**
- [ ] React Native mobile app
- [ ] Offline lesson viewing
- [ ] Push notifications
- [ ] Mobile-optimized exam interface

**Advanced Analytics:**
- [ ] Learning analytics dashboard
- [ ] Student engagement metrics
- [ ] Predictive analytics (at-risk students)
- [ ] Course effectiveness analysis

**Collaboration Features:**
- [ ] Discussion forums
- [ ] Peer review system
- [ ] Group assignments
- [ ] Live video classes (WebRTC)

**Gamification:**
- [ ] Badges and achievements
- [ ] Leaderboards
- [ ] Points system
- [ ] Certificates

---

## Quick Start Guide

### Step 1: Clone and setup

```bash
cd stock/stock-be

# Install new dependencies
npm install ioredis @nestjs/bull bull @aws-sdk/client-s3 @supabase/storage-js multer @nestjs/websockets @nestjs/platform-socket.io
npm install -D @types/ioredis @types/bull @types/multer @types/socket.io
```

### Step 2: Update database

```bash
# Create migration for new tables
npm run migration:generate -- -n AddEducationTables

# Run migration
npm run migration:run
```

### Step 3: Create first module (Courses)

```bash
# Use NestJS CLI
nest g module modules/courses
nest g controller modules/courses
nest g service modules/courses
```

### Step 4: Start development

```bash
# Start Redis
redis-server

# Start backend
npm run start:dev
```

### Step 5: Test APIs

```bash
# Use Postman or curl
curl http://localhost:3000/courses
```

---

## Resources

**Documentation:**
- [NestJS Docs](https://docs.nestjs.com/)
- [TypeORM Docs](https://typeorm.io/)
- [BullMQ Docs](https://docs.bullmq.io/)
- [Redis Docs](https://redis.io/docs/)

**Tools:**
- Postman for API testing
- pgAdmin for database management
- RedisInsight for Redis monitoring
- Swagger for API documentation

---

## Success Metrics

**Development:**
- [ ] All 50+ APIs implemented
- [ ] >80% test coverage
- [ ] <200ms average response time
- [ ] Zero critical security vulnerabilities

**Production:**
- [ ] Support 10,000 active students
- [ ] 99.9% uptime
- [ ] <500ms p95 response time
- [ ] Successful exam sessions without data loss

---

Bạn đã có đầy đủ tài liệu để bắt đầu xây dựng Education Platform! 🚀

Tôi khuyên bạn nên bắt đầu từ Phase 1, test kỹ từng module trước khi chuyển sang phase tiếp theo.
