# Education Platform - Complete System Design

## 📚 Tổng quan dự án

Đây là thiết kế hoàn chỉnh cho một **Education Platform** dành cho Học sinh và Giảng viên, được xây dựng trên nền tảng NestJS hiện có.

---

## 🎯 Mục tiêu

- Học sinh: Học bài, làm bài kiểm tra, xem kết quả
- Giảng viên: Quản lý lớp học, upload bài giảng, tạo đề thi, chấm điểm
- Admin: Quản lý hệ thống, phân quyền, thống kê
- Hệ thống: Bảo mật, scalable, dễ maintain

---

## 📖 Tài liệu thiết kế

Toàn bộ thiết kế hệ thống được chia thành 5 tài liệu chi tiết:

### 1. [System Architecture](./01-SYSTEM-ARCHITECTURE.md)
**Nội dung:**
- Kiến trúc tổng thể (Monolith Modular)
- Tech stack (NestJS + PostgreSQL + Redis + S3)
- Module structure (14 modules)
- Security architecture (RBAC, JWT RS256)
- Scalability strategy
- Monitoring & observability

**Highlights:**
```
✅ Leverage existing NestJS codebase
✅ RS256 JWT authentication (ĐÃ CÓ SẴN)
✅ Google OAuth (ĐÃ CÓ SẴN)
✅ Token rotation & blacklist (ĐÃ CÓ SẴN)
✅ Device fingerprinting (ĐÃ CÓ SẴN)
🆕 6 new modules to build
🆕 Redis for caching & sessions
🆕 BullMQ for background jobs
```

### 2. [Database Design](./02-DATABASE-DESIGN.md)
**Nội dung:**
- ERD (Entity Relationship Diagram)
- 15 core tables with detailed schema
- Indexes for performance
- Constraints & relationships
- Data volume estimates
- Partitioning strategy (future)

**Key Tables:**
```
- users (extended with role, student_code, lecturer_code)
- courses, course_enrollments
- lessons, lesson_materials, lesson_progress
- exams, questions, question_banks
- exam_attempts, exam_answers
- grades
- notifications
- audit_logs
```

**Features:**
```
✅ JSONB for flexible data (questions, options)
✅ Soft deletes where needed
✅ Audit trail
✅ Optimized indexes
✅ Supports 10K students (scalable to 100K+)
```

### 3. [API Design](./03-API-DESIGN.md)
**Nội dung:**
- 50+ RESTful API endpoints
- Request/Response examples (JSON)
- Authentication & authorization
- Error handling
- Pagination, filtering, sorting

**API Categories:**
```
1. Authentication (ĐÃ CÓ - mở rộng thêm role)
2. Student APIs (~15 endpoints)
   - Browse courses
   - Watch lessons
   - Take exams
   - View grades
3. Lecturer APIs (~20 endpoints)
   - Create courses
   - Upload materials
   - Create exams
   - Grade exams
   - View analytics
4. Admin APIs (~10 endpoints)
   - User management
   - System dashboard
   - Audit logs
5. Notifications APIs (~5 endpoints)
```

**Example:**
```typescript
// POST /exams/:id/start
Request: { device_info }
Response: {
  attempt: { id, started_at, must_submit_before },
  questions: [ /* shuffled questions */ ]
}
```

### 4. [Exam Flow & Grading System](./04-EXAM-FLOW-AND-GRADING.md)
**Nội dung:**
- Chi tiết từng bước làm bài thi
- Session management (Redis)
- Question shuffling
- Auto-grading system (BullMQ)
- Manual grading workflow
- Anti-cheating measures

**Exam Flow:**
```
1. Check Available → 
2. Start Exam (create session, shuffle) → 
3. Answer Questions (save to DB + Redis) → 
4. Submit → 
5. Auto-grade MCQ (background job) → 
6. Lecturer grade Essay → 
7. Calculate Final Score → 
8. Notify Student
```

**Security Features:**
```
✅ Question & option shuffling
✅ Session validation (Redis)
✅ Time limit enforcement
✅ Auto-submit on timeout
✅ Tab switch detection (optional)
✅ Question snapshot (prevents tampering)
```

**Grading:**
```
✅ Auto-grade: MCQ, True/False, Fill-blank
✅ Manual-grade: Essay
✅ Background queue processing
✅ Detailed feedback
✅ Grade history
```

### 5. [Implementation Roadmap](./05-IMPLEMENTATION-ROADMAP.md)
**Nội dung:**
- 4 phases (8 weeks)
- Detailed tasks for each phase
- Code examples for critical components
- Testing strategy
- Deployment checklist
- Future enhancements

**Timeline:**
```
Phase 1 (Week 1-2): Foundation
  - RBAC implementation
  - File upload module
  - Database setup

Phase 2 (Week 3-4): Core Modules
  - Courses module
  - Lessons module
  - Progress tracking

Phase 3 (Week 5-6): Exam System
  - Redis setup
  - BullMQ setup
  - Exams module
  - Grading module

Phase 4 (Week 7-8): Additional Features
  - Notifications (WebSocket)
  - Analytics
  - Admin dashboard
```

---

## 🛠️ Tech Stack Summary

### Backend (ĐÃ CÓ SẴN)
```
✅ NestJS (TypeScript)
✅ TypeORM
✅ PostgreSQL (Supabase)
✅ JWT RS256 Authentication
✅ Google OAuth
✅ Passport.js
✅ Class-validator
✅ Swagger
```

### Backend (CẦN THÊM)
```
🆕 Redis (caching, sessions)
🆕 BullMQ (background jobs)
🆕 AWS S3 / Supabase Storage (files)
🆕 Socket.io (real-time notifications)
🆕 Excel/CSV export
```

### Infrastructure
```
- Docker (containerization)
- Nginx (load balancer)
- CI/CD (GitHub Actions / GitLab CI)
- Monitoring (New Relic / Datadog)
```

---

## 📊 System Capabilities

### Performance
```
✅ Support 10,000 concurrent users
✅ <200ms API response time (p95)
✅ 99.9% uptime
✅ Handle 1,000 simultaneous exam takers
```

### Security
```
✅ RS256 JWT with token rotation
✅ Device fingerprinting
✅ Token blacklist
✅ Role-based access control (RBAC)
✅ Input validation & sanitization
✅ Rate limiting
✅ Audit logging
```

### Scalability
```
✅ Horizontal scaling ready
✅ Redis cluster support
✅ Database read replicas
✅ CDN for static assets
✅ Queue-based async processing
```

---

## 🚀 Quick Start

### 1. Đọc tài liệu theo thứ tự:
```
1. System Architecture - Hiểu tổng quan
2. Database Design - Hiểu data model
3. API Design - Hiểu các endpoints
4. Exam Flow - Hiểu nghiệp vụ phức tạp nhất
5. Implementation Roadmap - Bắt đầu code
```

### 2. Setup environment:
```bash
# Install dependencies
cd stock/stock-be
npm install ioredis @nestjs/bull bull @aws-sdk/client-s3 multer @nestjs/websockets

# Setup Redis
docker run -d -p 6379:6379 redis:alpine

# Setup database (already have Supabase)
# Run migrations for new tables
```

### 3. Start development:
```bash
# Follow Phase 1 in Implementation Roadmap
# Start with RBAC (roles.guard.ts, roles.decorator.ts)
```

---

## 📁 File Structure

```
stock/stock-be/
├── docs/
│   └── education-platform/
│       ├── 01-SYSTEM-ARCHITECTURE.md       ✅
│       ├── 02-DATABASE-DESIGN.md           ✅
│       ├── 03-API-DESIGN.md                ✅
│       ├── 04-EXAM-FLOW-AND-GRADING.md     ✅
│       ├── 05-IMPLEMENTATION-ROADMAP.md    ✅
│       └── README.md                        ✅ (this file)
│
├── src/
│   ├── modules/
│   │   ├── auth/              ✅ (existing - extend)
│   │   ├── users/             ✅ (existing - extend)
│   │   ├── courses/           🆕 (to build)
│   │   ├── lessons/           🆕 (to build)
│   │   ├── exams/             🆕 (to build)
│   │   ├── grading/           🆕 (to build)
│   │   ├── notifications/     🆕 (to build)
│   │   ├── file-upload/       🆕 (to build)
│   │   ├── analytics/         ✅ (existing - customize)
│   │   └── admin/             🆕 (to build)
│   │
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── roles.decorator.ts       🆕
│   │   │   └── current-user.decorator.ts 🆕
│   │   ├── guards/
│   │   │   └── roles.guard.ts           🆕
│   │   └── enums/
│   │       ├── role.enum.ts             🆕
│   │       └── exam-type.enum.ts        🆕
│   │
│   └── config/
│       └── redis.config.ts              🆕
```

---

## ✨ Key Features

### For Students
```
✅ Browse & enroll courses
✅ Watch video lessons
✅ Download materials (PDF, PPT)
✅ Track learning progress
✅ Take exams (MCQ, Essay, Fill-blank)
✅ View results & feedback
✅ Receive notifications
✅ View grades & certificates
```

### For Lecturers
```
✅ Create & manage courses
✅ Upload videos & documents
✅ Create question banks
✅ Create exams with shuffling
✅ Auto-grade MCQ
✅ Manual-grade essays
✅ View course analytics
✅ Export grades to Excel
✅ Manage students
```

### For Admins
```
✅ User management
✅ Role assignment
✅ System dashboard
✅ Audit logs
✅ Statistics & reports
```

---

## 🔒 Security Highlights

```
1. Authentication
   ✅ RS256 JWT (already implemented)
   ✅ Token rotation (already implemented)
   ✅ Token blacklist (already implemented)
   ✅ Device fingerprinting (already implemented)

2. Authorization
   🆕 Role-based access control
   🆕 Resource ownership checks
   🆕 Permission decorators

3. Exam Security
   🆕 Question shuffling
   🆕 Session validation
   🆕 Time enforcement
   🆕 Anti-cheating detection

4. Data Security
   ✅ Input validation
   ✅ SQL injection prevention
   ✅ XSS prevention
   🆕 Audit logging
```

---

## 📈 Scalability Path

### Current (MVP)
```
- Single NestJS instance
- PostgreSQL (Supabase)
- Redis (single instance)
- S3 for files
Supports: 10K users
```

### Growth (10K-100K users)
```
- Multiple NestJS instances
- Load balancer (Nginx / AWS ALB)
- Redis cluster
- Database read replicas
- CDN (CloudFront)
```

### Enterprise (100K+ users)
```
- Microservices (video service, grading service)
- Message queue (RabbitMQ / Kafka)
- Dedicated cache cluster
- Multi-region deployment
```

---

## 🧪 Testing Strategy

```
1. Unit Tests (>80% coverage)
   - All services
   - Critical utilities
   - Mock external deps

2. Integration Tests
   - API endpoints
   - Database operations
   - Queue processing

3. E2E Tests
   - Complete exam flow
   - Grading workflow
   - File upload/download
   - Authentication/Authorization

4. Load Tests
   - 1000 concurrent exams
   - 10K API requests/sec
   - File upload stress test
```

---

## 📚 Learning Resources

**NestJS:**
- [Official Docs](https://docs.nestjs.com/)
- [TypeORM Guide](https://typeorm.io/)

**Redis & Queues:**
- [Redis Commands](https://redis.io/commands/)
- [BullMQ Docs](https://docs.bullmq.io/)

**Best Practices:**
- Clean Code principles
- SOLID principles
- RESTful API design
- Database normalization

---

## 💡 Tips for Implementation

### 1. Start Small
```
✅ Build one module at a time
✅ Test thoroughly before moving on
✅ Don't skip database migrations
```

### 2. Follow the Roadmap
```
✅ Phase 1 first (foundation is critical)
✅ Don't jump to Phase 3 without Phase 2
✅ Each phase builds on previous
```

### 3. Reuse Existing Code
```
✅ Auth module is production-ready
✅ User module just needs extension
✅ Common filters/interceptors already there
```

### 4. Test Early & Often
```
✅ Write tests alongside features
✅ Use Postman collections
✅ Set up CI/CD early
```

### 5. Document as You Go
```
✅ Update Swagger annotations
✅ Write code comments
✅ Keep README updated
```

---

## 🎓 Expected Outcomes

**After 8 weeks:**
```
✅ Fully functional Education Platform
✅ 50+ working API endpoints
✅ Complete exam system with auto-grading
✅ Role-based access control
✅ Real-time notifications
✅ Admin dashboard
✅ >80% test coverage
✅ Production-ready
```

**Can support:**
```
✅ 10,000 active students
✅ 100 lecturers
✅ 500 courses
✅ 2,000 exams
✅ 1,000 concurrent exam sessions
```

---

## 🤝 Support & Maintenance

### Regular Tasks
```
- Daily: Monitor logs & errors
- Weekly: Review performance metrics
- Monthly: Update dependencies
- Quarterly: Security audit
```

### Backup Strategy
```
- Database: Daily full + hourly incremental
- Files: S3 versioning + cross-region replication
- Retention: 30 days
```

---

## 🔮 Future Enhancements

**Post-MVP Features:**
```
🔮 AI auto-grading for essays (OpenAI)
🔮 Plagiarism detection
🔮 Mobile app (React Native)
🔮 Live video classes (WebRTC)
🔮 Discussion forums
🔮 Gamification (badges, leaderboards)
🔮 Advanced analytics & AI recommendations
```

---

## 📞 Contact & Support

**Documentation Location:**
```
stock-be/docs/education-platform/
```

**For questions:**
1. Read the relevant documentation section
2. Check Implementation Roadmap for examples
3. Review existing codebase for patterns

---

## ✅ Checklist to Get Started

```
Phase 0: Preparation
[ ] Read all 5 documentation files
[ ] Understand current codebase structure
[ ] Set up local development environment
[ ] Install Redis locally
[ ] Verify database connection

Phase 1: Foundation (Start Here)
[ ] Create role enum & decorators
[ ] Implement RolesGuard
[ ] Update User entity with new fields
[ ] Create database migration
[ ] Test RBAC with sample endpoints

Next: Follow Phase 2-4 in Implementation Roadmap
```

---

**🎉 Bạn đã có đầy đủ tài liệu để xây dựng Education Platform!**

Chúc bạn thành công! 🚀

---

**Last Updated:** January 27, 2026  
**Version:** 1.0.0  
**Status:** ✅ Design Complete - Ready for Implementation
