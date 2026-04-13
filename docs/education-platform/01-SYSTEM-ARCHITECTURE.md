# Education Platform - System Architecture

## 1. Kiến trúc tổng thể

### 1.1. Lựa chọn: MONOLITH MODULAR

**Lý do chọn Monolith (với module hóa tốt) thay vì Microservices:**

✅ **Ưu điểm cho dự án Education:**
- Dễ phát triển và deploy ban đầu
- Ít phức tạp về infrastructure
- Transaction ACID đơn giản (điểm số, bài thi)
- Dễ debug và monitoring
- Chi phí vận hành thấp hơn
- Team nhỏ dễ quản lý

⚠️ **Khi nào chuyển sang Microservices:**
- Hệ thống có > 100,000 học sinh hoạt động đồng thời
- Cần scale riêng video streaming
- Cần team độc lập cho từng module
- Cần deploy riêng các tính năng

### 1.2. Kiến trúc layers

```
┌─────────────────────────────────────────────────┐
│                   API Gateway                   │
│         (Rate Limiting, CORS, Auth)             │
└─────────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────────┐
│              Controller Layer                   │
│    (Routing, Validation, Authorization)         │
└─────────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────────┐
│              Service Layer                      │
│         (Business Logic, Workflows)             │
└─────────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────────┐
│            Repository Layer                     │
│         (Database Access, ORM)                  │
└─────────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────────┐
│             Database Layer                      │
│    (PostgreSQL + Redis + File Storage)          │
└─────────────────────────────────────────────────┘
```

### 1.3. Tech Stack (dựa trên codebase hiện tại)

**Backend Framework:**
- **NestJS** (TypeScript) - Đã có sẵn
- Lý do: Modular, có sẵn auth với RS256 JWT, TypeORM, decorator-based

**Database:**
- **PostgreSQL** (Primary) - Đã có sẵn kết nối Supabase
  - Lưu user, courses, exams, grades
- **Redis** (Cache + Session) - Cần thêm
  - Cache câu hỏi thi
  - Session làm bài
  - Real-time presence

**File Storage:**
- **AWS S3** hoặc **Supabase Storage**
  - Video bài giảng
  - PDF/PPT slides
  - Ảnh câu hỏi

**Authentication:**
- JWT RS256 với token rotation - **ĐÃ CÓ SẴN**
- Google OAuth - **ĐÃ CÓ SẴN**
- Device fingerprinting - **ĐÃ CÓ SẴN**

**Queue System:**
- **BullMQ** (Redis-based)
  - Chấm điểm background
  - Email notifications
  - Video processing

### 1.4. Module Structure

```
src/
├── modules/
│   ├── auth/                 # ✅ ĐÃ CÓ (RS256 JWT, Google OAuth)
│   ├── users/                # ✅ ĐÃ CÓ (cần mở rộng thêm role)
│   │
│   ├── courses/              # 🆕 Quản lý khóa học
│   │   ├── courses.module.ts
│   │   ├── courses.controller.ts
│   │   ├── courses.service.ts
│   │   ├── entities/
│   │   │   ├── course.entity.ts
│   │   │   └── course-enrollment.entity.ts
│   │   └── dto/
│   │
│   ├── lessons/              # 🆕 Bài giảng
│   │   ├── lessons.module.ts
│   │   ├── lessons.controller.ts
│   │   ├── lessons.service.ts
│   │   ├── entities/
│   │   │   ├── lesson.entity.ts
│   │   │   ├── lesson-material.entity.ts
│   │   │   └── lesson-progress.entity.ts
│   │   └── dto/
│   │
│   ├── exams/                # 🆕 Bài kiểm tra
│   │   ├── exams.module.ts
│   │   ├── exams.controller.ts
│   │   ├── exams.service.ts
│   │   ├── entities/
│   │   │   ├── exam.entity.ts
│   │   │   ├── question.entity.ts
│   │   │   ├── question-bank.entity.ts
│   │   │   ├── exam-attempt.entity.ts
│   │   │   └── exam-answer.entity.ts
│   │   ├── services/
│   │   │   ├── exam-generation.service.ts
│   │   │   ├── exam-grading.service.ts
│   │   │   └── exam-proctoring.service.ts
│   │   └── dto/
│   │
│   ├── grading/              # 🆕 Chấm điểm
│   │   ├── grading.module.ts
│   │   ├── grading.controller.ts
│   │   ├── grading.service.ts
│   │   ├── entities/
│   │   │   ├── grade.entity.ts
│   │   │   └── grade-history.entity.ts
│   │   └── processors/
│   │       ├── auto-grading.processor.ts
│   │       └── manual-grading.processor.ts
│   │
│   ├── notifications/        # 🆕 Thông báo
│   │   ├── notifications.module.ts
│   │   ├── notifications.controller.ts
│   │   ├── notifications.service.ts
│   │   ├── entities/
│   │   │   └── notification.entity.ts
│   │   └── gateways/
│   │       └── notifications.gateway.ts (WebSocket)
│   │
│   ├── analytics/            # ✅ ĐÃ CÓ (cần customize cho education)
│   │   └── ... thống kê điểm, tiến độ
│   │
│   ├── file-upload/          # 🆕 Upload file
│   │   ├── file-upload.module.ts
│   │   ├── file-upload.controller.ts
│   │   ├── file-upload.service.ts
│   │   └── strategies/
│   │       ├── s3-upload.strategy.ts
│   │       └── supabase-upload.strategy.ts
│   │
│   └── admin/                # 🆕 Admin dashboard
│       ├── admin.module.ts
│       ├── admin.controller.ts
│       └── admin.service.ts
│
├── common/                   # ✅ ĐÃ CÓ (decorators, guards, filters)
│   ├── decorators/
│   │   ├── public.decorator.ts       # ✅
│   │   ├── roles.decorator.ts        # 🆕 Thêm
│   │   └── current-user.decorator.ts # 🆕 Thêm
│   ├── guards/
│   │   ├── jwt-auth.guard.ts         # ✅
│   │   └── roles.guard.ts            # 🆕 Thêm
│   ├── filters/
│   │   └── all-exceptions.filter.ts  # ✅
│   ├── interceptors/
│   │   └── logging.interceptor.ts    # ✅
│   └── enums/
│       ├── role.enum.ts              # 🆕 Thêm
│       ├── exam-type.enum.ts         # 🆕 Thêm
│       └── question-type.enum.ts     # 🆕 Thêm
│
├── config/                   # ✅ ĐÃ CÓ
│   └── config.validation.ts
│
└── database/                 # ✅ ĐÃ CÓ
    ├── migrations/
    └── seeders/
```

### 1.5. Data Flow Architecture

#### Authentication Flow (ĐÃ CÓ SẴN)
```
User → Login → AuthService → JWT (RS256)
                    ↓
            RefreshToken (7 days)
                    ↓
            DeviceFingerprint
                    ↓
            TokenBlacklist (on logout)
```

#### Exam Taking Flow (MỚI)
```
Student → Start Exam → Create ExamAttempt
              ↓
       Load Questions (shuffled)
              ↓
       Save to Redis (session)
              ↓
       Student Answers
              ↓
       Save Each Answer to DB
              ↓
       Submit Exam
              ↓
       Auto-grade MCQ → Queue
              ↓
       Lecturer grade Essay → Queue
              ↓
       Calculate Final Score
              ↓
       Save Grade + Notify Student
```

#### File Upload Flow (MỚI)
```
Lecturer → Upload Video/PDF
              ↓
       Validate (size, type)
              ↓
       Generate unique filename
              ↓
       Upload to S3/Supabase
              ↓
       Get public URL
              ↓
       Save to LessonMaterial
              ↓
       Return URL to client
```

### 1.6. Security Architecture

#### Role-Based Access Control (RBAC)

```typescript
// Roles hierarchy
Admin > Lecturer > Student

// Permission matrix
┌──────────────┬─────────┬───────────┬─────────┐
│   Resource   │ Student │ Lecturer  │  Admin  │
├──────────────┼─────────┼───────────┼─────────┤
│ View Course  │    ✓    │     ✓     │    ✓    │
│ Create Course│    ✗    │     ✓     │    ✓    │
│ Edit Course  │    ✗    │  Own only │    ✓    │
│ Delete Course│    ✗    │  Own only │    ✓    │
├──────────────┼─────────┼───────────┼─────────┤
│ Take Exam    │    ✓    │     ✗     │    ✗    │
│ Create Exam  │    ✗    │     ✓     │    ✓    │
│ Grade Exam   │    ✗    │     ✓     │    ✓    │
│ View Grades  │  Own    │   Class   │   All   │
├──────────────┼─────────┼───────────┼─────────┤
│ Manage Users │    ✗    │     ✗     │    ✓    │
│ View Stats   │  Own    │   Course  │   All   │
└──────────────┴─────────┴───────────┴─────────┘
```

#### Security Layers

1. **API Layer**
   - Rate limiting (already have ThrottlerModule)
   - CORS configuration
   - Helmet.js for security headers

2. **Authentication Layer** (ĐÃ CÓ)
   - RS256 JWT
   - Token rotation
   - Device fingerprinting
   - Token blacklist

3. **Authorization Layer** (CẦN THÊM)
   - Role-based guards
   - Resource ownership checks
   - Permission decorators

4. **Data Layer**
   - SQL injection prevention (TypeORM)
   - Input validation (class-validator)
   - XSS prevention
   - Encrypted sensitive data

5. **Exam Security** (MỚI)
   - Question shuffling
   - Answer shuffling
   - Time limit enforcement
   - Session validation
   - Prevent multiple submissions
   - IP tracking (optional)
   - Browser lock detection (optional)

### 1.7. Scalability Strategy

#### Phase 1: Monolith (0-10k users)
- Single NestJS instance
- PostgreSQL + Redis
- S3 for files
- Current approach

#### Phase 2: Horizontal Scaling (10k-100k users)
- Load balancer (AWS ALB / Nginx)
- Multiple NestJS instances
- Redis cluster for sessions
- CDN for static content (CloudFront)
- Database read replicas

#### Phase 3: Service Separation (100k+ users)
- Extract heavy services:
  - Video service (streaming)
  - Grading service (background jobs)
  - Analytics service (reporting)
- Message queue (RabbitMQ / Kafka)
- Dedicated cache cluster

### 1.8. Monitoring & Observability

**Logging:**
- Winston logger (already have LoggingInterceptor)
- Centralized logs (ELK stack / CloudWatch)
- Structured logging (JSON format)

**Metrics:**
- Request latency
- Error rates
- Active exam sessions
- Database query performance
- Cache hit ratio

**Tracing:**
- APM tool (New Relic / Datadog)
- Distributed tracing for heavy operations

**Alerting:**
- Exam system downtime
- High error rates
- Database connection issues
- Disk space

### 1.9. Backup & Disaster Recovery

**Database Backup:**
- Daily full backup
- Hourly incremental backup
- Point-in-time recovery
- 30-day retention

**File Backup:**
- S3 versioning enabled
- Cross-region replication
- Lifecycle policies

**Disaster Recovery:**
- RPO (Recovery Point Objective): 1 hour
- RTO (Recovery Time Objective): 4 hours
- Multi-region deployment (optional)

### 1.10. Development Workflow

**Environment:**
```
Development → Staging → Production
    ↓           ↓          ↓
  Local      QA/UAT    Live Users
```

**CI/CD Pipeline:**
1. Code push → GitHub
2. Run tests (unit + integration)
3. Build Docker image
4. Deploy to staging
5. Run E2E tests
6. Manual approval
7. Deploy to production
8. Smoke tests

**Database Migration:**
- TypeORM migrations
- Version controlled
- Tested in staging first
- Rollback plan always ready

---

## Summary

✅ **Strengths of this architecture:**
- Leverages existing NestJS codebase
- Proven auth system (RS256 JWT)
- Modular and maintainable
- Can scale horizontally
- Clear separation of concerns

🔄 **What needs to be added:**
- Role-based authorization
- 6 new modules (courses, lessons, exams, grading, notifications, file-upload)
- Redis for caching and sessions
- Queue system for background jobs
- WebSocket for real-time features

📊 **Expected Performance:**
- Support 10,000 concurrent users
- < 200ms API response time
- 99.9% uptime
- Handle 1,000 simultaneous exam takers

Trong các tài liệu tiếp theo, tôi sẽ chi tiết:
1. Database Schema (ERD)
2. API Design cho từng role
3. Exam Flow chi tiết
4. Grading System
5. Implementation roadmap
