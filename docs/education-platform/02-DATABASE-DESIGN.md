# Education Platform - Database Design

## 1. Entity Relationship Diagram (ERD)

### 1.1. Core Entities Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       CORE ENTITIES                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Users ←──→ RefreshTokens (1:N)                                │
│    ↓                                                            │
│    ├──→ CourseEnrollments (1:N) ←──→ Courses (N:1)            │
│    ├──→ LessonProgress (1:N) ←──→ Lessons (N:1)               │
│    ├──→ ExamAttempts (1:N) ←──→ Exams (N:1)                   │
│    ├──→ ExamAnswers (1:N) ←──→ Questions (N:1)                │
│    └──→ Grades (1:N)                                           │
│                                                                 │
│  Courses (1:N) ←──→ Lessons                                    │
│  Courses (1:N) ←──→ Exams                                      │
│  Lessons (1:N) ←──→ LessonMaterials                           │
│  Exams (1:N) ←──→ ExamQuestions (N:M) ←──→ Questions          │
│  Questions ←──→ QuestionBank (N:1)                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2. Detailed Schema

---

## 2. User Management Schema

### 2.1. users (MỞ RỘNG TỪ TABLE HIỆN CÓ)

```sql
CREATE TABLE users (
  -- Existing columns
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  provider VARCHAR(50),
  provider_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- NEW columns for Education
  role VARCHAR(20) NOT NULL DEFAULT 'student', -- 'student', 'lecturer', 'admin'
  full_name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  phone VARCHAR(20),
  date_of_birth DATE,
  gender VARCHAR(10),
  
  -- Student-specific
  student_code VARCHAR(50) UNIQUE, -- Mã học sinh
  
  -- Lecturer-specific
  lecturer_code VARCHAR(50) UNIQUE, -- Mã giảng viên
  department VARCHAR(100),
  bio TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_email_verified BOOLEAN DEFAULT false,
  last_login_at TIMESTAMP,
  
  -- Indexes
  INDEX idx_users_email (email),
  INDEX idx_users_role (role),
  INDEX idx_users_student_code (student_code),
  INDEX idx_users_lecturer_code (lecturer_code)
);
```

### 2.2. refresh_tokens (ĐÃ CÓ SẴN)

Already exists with RS256 JWT, token rotation, device fingerprinting

---

## 3. Course Management Schema

### 3.1. courses

```sql
CREATE TABLE courses (
  id SERIAL PRIMARY KEY,
  
  -- Basic info
  code VARCHAR(50) UNIQUE NOT NULL, -- VD: CS101
  title VARCHAR(255) NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  
  -- Course details
  lecturer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category VARCHAR(100),
  level VARCHAR(20), -- 'beginner', 'intermediate', 'advanced'
  language VARCHAR(20) DEFAULT 'vi',
  
  -- Enrollment
  max_students INTEGER DEFAULT 100,
  enrollment_start_date TIMESTAMP,
  enrollment_end_date TIMESTAMP,
  
  -- Course period
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'published', 'archived'
  is_featured BOOLEAN DEFAULT false,
  
  -- Metadata
  total_lessons INTEGER DEFAULT 0,
  total_hours DECIMAL(5,2),
  passing_score INTEGER DEFAULT 70, -- Điểm qua môn (%)
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP, -- Soft delete
  
  -- Indexes
  INDEX idx_courses_lecturer (lecturer_id),
  INDEX idx_courses_code (code),
  INDEX idx_courses_status (status),
  INDEX idx_courses_category (category)
);
```

### 3.2. course_enrollments

```sql
CREATE TABLE course_enrollments (
  id SERIAL PRIMARY KEY,
  
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Enrollment info
  enrolled_at TIMESTAMP DEFAULT NOW(),
  enrollment_status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'dropped', 'failed'
  
  -- Progress
  progress_percentage DECIMAL(5,2) DEFAULT 0.00, -- 0-100
  last_accessed_at TIMESTAMP,
  
  -- Completion
  completed_at TIMESTAMP,
  final_grade DECIMAL(5,2), -- Điểm tổng kết
  certificate_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(course_id, student_id),
  
  -- Indexes
  INDEX idx_enrollments_course (course_id),
  INDEX idx_enrollments_student (student_id),
  INDEX idx_enrollments_status (enrollment_status)
);
```

---

## 4. Lesson Management Schema

### 4.1. lessons

```sql
CREATE TABLE lessons (
  id SERIAL PRIMARY KEY,
  
  -- Basic info
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Ordering
  order_index INTEGER NOT NULL, -- Thứ tự bài học
  chapter_name VARCHAR(100), -- Tên chương
  
  -- Content
  content_type VARCHAR(20) NOT NULL, -- 'video', 'text', 'pdf', 'quiz'
  content_text TEXT, -- Nội dung text (markdown)
  duration_minutes INTEGER, -- Thời lượng học (phút)
  
  -- Requirements
  is_free BOOLEAN DEFAULT false, -- Bài học miễn phí
  is_mandatory BOOLEAN DEFAULT true,
  prerequisite_lesson_id INTEGER REFERENCES lessons(id), -- Bài học tiên quyết
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'published'
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  -- Indexes
  INDEX idx_lessons_course (course_id),
  INDEX idx_lessons_order (course_id, order_index),
  INDEX idx_lessons_status (status)
);
```

### 4.2. lesson_materials

```sql
CREATE TABLE lesson_materials (
  id SERIAL PRIMARY KEY,
  
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  
  -- File info
  file_type VARCHAR(20) NOT NULL, -- 'video', 'pdf', 'ppt', 'doc', 'image'
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT, -- bytes
  
  -- Video specific
  video_duration INTEGER, -- seconds
  video_thumbnail_url TEXT,
  
  -- Display
  order_index INTEGER DEFAULT 0,
  title VARCHAR(255),
  description TEXT,
  
  -- Access control
  is_downloadable BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_materials_lesson (lesson_id)
);
```

### 4.3. lesson_progress

```sql
CREATE TABLE lesson_progress (
  id SERIAL PRIMARY KEY,
  
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Progress tracking
  status VARCHAR(20) DEFAULT 'not_started', -- 'not_started', 'in_progress', 'completed'
  progress_percentage DECIMAL(5,2) DEFAULT 0.00,
  
  -- Video tracking
  last_video_position INTEGER, -- seconds
  
  -- Completion
  completed_at TIMESTAMP,
  time_spent_minutes INTEGER DEFAULT 0,
  
  -- Timestamps
  first_accessed_at TIMESTAMP,
  last_accessed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(lesson_id, student_id),
  
  -- Indexes
  INDEX idx_progress_lesson (lesson_id),
  INDEX idx_progress_student (student_id),
  INDEX idx_progress_status (status)
);
```

---

## 5. Exam Management Schema

### 5.1. exams

```sql
CREATE TABLE exams (
  id SERIAL PRIMARY KEY,
  
  -- Basic info
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Exam settings
  exam_type VARCHAR(20) NOT NULL, -- 'quiz', 'midterm', 'final', 'assignment'
  total_marks DECIMAL(5,2) NOT NULL, -- Tổng điểm
  passing_marks DECIMAL(5,2) NOT NULL, -- Điểm đạt
  
  -- Time settings
  duration_minutes INTEGER NOT NULL, -- Thời gian làm bài
  available_from TIMESTAMP NOT NULL,
  available_until TIMESTAMP NOT NULL,
  
  -- Attempt settings
  max_attempts INTEGER DEFAULT 1, -- Số lần làm tối đa
  show_results_immediately BOOLEAN DEFAULT false,
  show_correct_answers BOOLEAN DEFAULT false,
  
  -- Randomization
  shuffle_questions BOOLEAN DEFAULT true,
  shuffle_options BOOLEAN DEFAULT true,
  random_question_count INTEGER, -- Số câu random từ ngân hàng
  
  -- Proctoring (giám sát)
  is_proctored BOOLEAN DEFAULT false,
  require_webcam BOOLEAN DEFAULT false,
  detect_tab_switch BOOLEAN DEFAULT false,
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'published', 'closed'
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  -- Indexes
  INDEX idx_exams_course (course_id),
  INDEX idx_exams_type (exam_type),
  INDEX idx_exams_status (status),
  INDEX idx_exams_dates (available_from, available_until)
);
```

### 5.2. question_banks

```sql
CREATE TABLE question_banks (
  id SERIAL PRIMARY KEY,
  
  lecturer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  subject VARCHAR(100),
  
  total_questions INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_qbank_lecturer (lecturer_id)
);
```

### 5.3. questions

```sql
CREATE TABLE questions (
  id SERIAL PRIMARY KEY,
  
  question_bank_id INTEGER REFERENCES question_banks(id) ON DELETE SET NULL,
  
  -- Question content
  question_type VARCHAR(20) NOT NULL, -- 'multiple_choice', 'true_false', 'essay', 'fill_blank'
  question_text TEXT NOT NULL,
  question_image_url TEXT,
  
  -- Marks
  marks DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  
  -- Multiple choice options (JSON)
  options JSONB, -- [{"id": "A", "text": "...", "is_correct": true}, ...]
  
  -- Essay grading
  essay_keywords JSONB, -- Keywords cho auto-grading (optional)
  essay_max_words INTEGER,
  
  -- Fill in the blank
  blank_answers JSONB, -- ["answer1", "answer2"]
  
  -- Correct answer (for non-MCQ)
  correct_answer TEXT,
  
  -- Metadata
  difficulty_level VARCHAR(20), -- 'easy', 'medium', 'hard'
  topic VARCHAR(100),
  explanation TEXT, -- Giải thích đáp án
  
  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  average_score DECIMAL(5,2),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_questions_bank (question_bank_id),
  INDEX idx_questions_type (question_type),
  INDEX idx_questions_difficulty (difficulty_level)
);
```

**Example question.options JSON:**
```json
[
  {
    "id": "A",
    "text": "Hà Nội",
    "is_correct": true
  },
  {
    "id": "B",
    "text": "Hồ Chí Minh",
    "is_correct": false
  },
  {
    "id": "C",
    "text": "Đà Nẵng",
    "is_correct": false
  },
  {
    "id": "D",
    "text": "Cần Thơ",
    "is_correct": false
  }
]
```

### 5.4. exam_questions (Many-to-Many)

```sql
CREATE TABLE exam_questions (
  id SERIAL PRIMARY KEY,
  
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  
  -- Ordering
  order_index INTEGER NOT NULL,
  
  -- Override marks for this exam
  marks_override DECIMAL(5,2),
  
  -- Constraints
  UNIQUE(exam_id, question_id),
  
  -- Indexes
  INDEX idx_exam_questions_exam (exam_id),
  INDEX idx_exam_questions_question (question_id)
);
```

### 5.5. exam_attempts

```sql
CREATE TABLE exam_attempts (
  id SERIAL PRIMARY KEY,
  
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Attempt info
  attempt_number INTEGER NOT NULL, -- 1, 2, 3...
  
  -- Timing
  started_at TIMESTAMP NOT NULL,
  submitted_at TIMESTAMP,
  duration_seconds INTEGER,
  
  -- Questions (snapshot of shuffled questions)
  questions_snapshot JSONB NOT NULL, -- [{question_id, order, options_shuffled}, ...]
  
  -- Scoring
  status VARCHAR(20) DEFAULT 'in_progress', -- 'in_progress', 'submitted', 'graded', 'expired'
  score DECIMAL(5,2),
  max_score DECIMAL(5,2),
  percentage DECIMAL(5,2),
  passed BOOLEAN,
  
  -- Grading
  auto_graded_at TIMESTAMP,
  manually_graded_at TIMESTAMP,
  graded_by_lecturer_id INTEGER REFERENCES users(id),
  
  -- Proctoring data
  ip_address VARCHAR(45),
  user_agent TEXT,
  tab_switches_count INTEGER DEFAULT 0,
  suspicious_activities JSONB, -- [{"type": "tab_switch", "timestamp": "..."}]
  
  -- Feedback
  lecturer_feedback TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_attempts_exam (exam_id),
  INDEX idx_attempts_student (student_id),
  INDEX idx_attempts_status (status),
  INDEX idx_attempts_exam_student (exam_id, student_id, attempt_number)
);
```

**Example questions_snapshot JSON:**
```json
[
  {
    "question_id": 101,
    "order": 1,
    "marks": 2.5,
    "shuffled_options": ["B", "A", "D", "C"]
  },
  {
    "question_id": 205,
    "order": 2,
    "marks": 2.5,
    "shuffled_options": ["C", "D", "A", "B"]
  }
]
```

### 5.6. exam_answers

```sql
CREATE TABLE exam_answers (
  id SERIAL PRIMARY KEY,
  
  attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  
  -- Student's answer
  selected_option VARCHAR(10), -- For MCQ: "A", "B", "C", "D"
  essay_answer TEXT, -- For essay questions
  fill_blank_answer TEXT, -- For fill in blank
  
  -- Grading
  is_correct BOOLEAN,
  marks_awarded DECIMAL(5,2),
  marks_possible DECIMAL(5,2),
  
  -- Grading details
  grading_notes TEXT, -- Ghi chú của giảng viên
  graded_at TIMESTAMP,
  graded_by_lecturer_id INTEGER REFERENCES users(id),
  
  -- Timing
  answered_at TIMESTAMP,
  time_spent_seconds INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(attempt_id, question_id),
  
  -- Indexes
  INDEX idx_answers_attempt (attempt_id),
  INDEX idx_answers_question (question_id),
  INDEX idx_answers_grading (is_correct, graded_at)
);
```

---

## 6. Grading Schema

### 6.1. grades

```sql
CREATE TABLE grades (
  id SERIAL PRIMARY KEY,
  
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  exam_id INTEGER REFERENCES exams(id) ON DELETE SET NULL,
  
  -- Grade info
  grade_type VARCHAR(20) NOT NULL, -- 'exam', 'assignment', 'participation', 'final'
  grade_value DECIMAL(5,2) NOT NULL,
  max_value DECIMAL(5,2) NOT NULL,
  percentage DECIMAL(5,2),
  
  -- Weight
  weight DECIMAL(5,2), -- Trọng số (%) trong tổng điểm
  
  -- Grading
  graded_by_lecturer_id INTEGER REFERENCES users(id),
  graded_at TIMESTAMP,
  
  -- Comments
  comments TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_grades_student (student_id),
  INDEX idx_grades_course (course_id),
  INDEX idx_grades_exam (exam_id),
  INDEX idx_grades_student_course (student_id, course_id)
);
```

---

## 7. Notification Schema

### 7.1. notifications

```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Notification content
  type VARCHAR(50) NOT NULL, -- 'exam_available', 'grade_published', 'course_update', etc.
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  
  -- Related entities
  related_entity_type VARCHAR(50), -- 'course', 'exam', 'grade'
  related_entity_id INTEGER,
  
  -- Action URL
  action_url TEXT,
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  
  -- Priority
  priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  
  -- Indexes
  INDEX idx_notifications_user (user_id),
  INDEX idx_notifications_type (type),
  INDEX idx_notifications_read (user_id, is_read),
  INDEX idx_notifications_created (created_at DESC)
);
```

---

## 8. Supporting Tables

### 8.1. audit_logs

```sql
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  
  -- Who
  user_id INTEGER REFERENCES users(id),
  user_email VARCHAR(255),
  user_role VARCHAR(20),
  
  -- What
  action VARCHAR(100) NOT NULL, -- 'created', 'updated', 'deleted', 'viewed'
  entity_type VARCHAR(50) NOT NULL, -- 'course', 'exam', 'grade'
  entity_id INTEGER NOT NULL,
  
  -- Changes
  old_values JSONB,
  new_values JSONB,
  
  -- Where/When
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_created (created_at DESC)
);
```

### 8.2. system_settings

```sql
CREATE TABLE system_settings (
  id SERIAL PRIMARY KEY,
  
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  data_type VARCHAR(20) NOT NULL, -- 'string', 'number', 'boolean', 'json'
  
  description TEXT,
  is_public BOOLEAN DEFAULT false, -- Có được phép đọc từ frontend không
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_settings_key (key)
);
```

**Example settings:**
```sql
INSERT INTO system_settings (key, value, data_type, description) VALUES
('max_file_upload_size', '100', 'number', 'Max file size in MB'),
('allowed_video_formats', '["mp4", "avi", "mov"]', 'json', 'Allowed video formats'),
('exam_session_timeout', '1800', 'number', 'Exam session timeout in seconds'),
('enable_proctoring', 'false', 'boolean', 'Enable exam proctoring features');
```

---

## 9. Indexes Summary

### Performance-critical indexes:

```sql
-- User lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Course queries
CREATE INDEX idx_courses_lecturer ON courses(lecturer_id);
CREATE INDEX idx_courses_status ON courses(status);

-- Enrollment queries
CREATE INDEX idx_enrollments_student ON course_enrollments(student_id);
CREATE INDEX idx_enrollments_course ON course_enrollments(course_id);

-- Exam queries
CREATE INDEX idx_attempts_exam_student ON exam_attempts(exam_id, student_id);
CREATE INDEX idx_answers_attempt ON exam_answers(attempt_id);

-- Notification queries
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);

-- Audit queries
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
```

---

## 10. Database Constraints

### Foreign Key Constraints:

✅ **ON DELETE CASCADE** - Delete related records:
- course_enrollments → courses
- lessons → courses
- lesson_materials → lessons
- exam_questions → exams

✅ **ON DELETE RESTRICT** - Prevent deletion if referenced:
- courses → users (lecturer)
- exams → courses
- exam_attempts → exams

✅ **ON DELETE SET NULL** - Remove reference but keep record:
- questions → question_banks
- grades → exams

### Unique Constraints:

```sql
UNIQUE (course_id, student_id) -- course_enrollments
UNIQUE (lesson_id, student_id) -- lesson_progress
UNIQUE (exam_id, question_id) -- exam_questions
UNIQUE (attempt_id, question_id) -- exam_answers
```

---

## 11. Data Volume Estimates

Assuming 10,000 students, 100 lecturers:

| Table | Estimated Rows | Size Est. | Notes |
|-------|---------------|-----------|-------|
| users | 10,100 | ~2 MB | Small |
| courses | 500 | ~100 KB | Few courses |
| course_enrollments | 50,000 | ~5 MB | Average 5 courses/student |
| lessons | 5,000 | ~1 MB | 10 lessons/course |
| lesson_progress | 250,000 | ~30 MB | All students × lessons |
| exams | 2,000 | ~500 KB | 4 exams/course |
| questions | 10,000 | ~10 MB | Question bank |
| exam_attempts | 100,000 | ~150 MB | Multiple attempts |
| exam_answers | 1,000,000 | ~200 MB | 10 questions/exam avg |
| grades | 200,000 | ~20 MB | Multiple grades/student |
| notifications | 500,000 | ~50 MB | Many notifications |
| audit_logs | 1,000,000+ | ~500 MB | High volume |

**Total estimated DB size:** ~1 GB for 10K active users

---

## 12. Partitioning Strategy (Future)

When data grows large (>100K students):

```sql
-- Partition exam_attempts by created_at
CREATE TABLE exam_attempts_2024_q1 PARTITION OF exam_attempts
FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

-- Partition audit_logs by created_at
CREATE TABLE audit_logs_2024_01 PARTITION OF audit_logs
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

---

## Summary

✅ **Schema Features:**
- 15 core tables
- Full RBAC support
- Exam security (shuffling, proctoring, snapshots)
- Audit trail
- Soft deletes where needed
- Optimized indexes
- JSONB for flexible data (questions, options, snapshots)

✅ **Scalability:**
- Supports 10K students easily
- Can scale to 100K with partitioning
- Efficient queries with proper indexes

✅ **Security:**
- Foreign key constraints
- Unique constraints to prevent duplicates
- Audit logs for compliance
- Soft deletes for data retention

Tiếp theo: API Design cho từng role
