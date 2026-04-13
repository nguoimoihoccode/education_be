# Education Platform - API Design

## Tổng quan API

**Base URL:** `https://api.education.com/v1`  
**Authentication:** Bearer JWT Token (RS256)  
**Content-Type:** `application/json`

---

## 1. Authentication APIs (ĐÃ CÓ SẴN - Mở rộng)

### 1.1. POST /auth/register
Đăng ký tài khoản mới

**Request:**
```json
{
  "email": "student@example.com",
  "password": "SecurePass123!",
  "full_name": "Nguyễn Văn A",
  "role": "student",
  "student_code": "SV001" // Optional for student
}
```

**Response:** 200 OK
```json
{
  "user": {
    "id": 1,
    "email": "student@example.com",
    "full_name": "Nguyễn Văn A",
    "role": "student",
    "student_code": "SV001"
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

---

## 2. Student APIs

### 2.1. GET /courses
Lấy danh sách khóa học (có thể lọc, tìm kiếm)

**Query Params:**
```
?page=1
&limit=20
&search=programming
&category=technology
&level=beginner
&enrolled=true  // Chỉ lấy khóa đã đăng ký
```

**Response:** 200 OK
```json
{
  "data": [
    {
      "id": 1,
      "code": "CS101",
      "title": "Introduction to Programming",
      "description": "Learn basics of programming",
      "thumbnail_url": "https://...",
      "lecturer": {
        "id": 10,
        "full_name": "Dr. John Doe",
        "avatar_url": "https://..."
      },
      "category": "Technology",
      "level": "beginner",
      "total_lessons": 20,
      "total_hours": 40.5,
      "enrolled_students": 150,
      "my_enrollment": {
        "enrolled_at": "2024-01-15T10:00:00Z",
        "progress_percentage": 35.5,
        "status": "active"
      }
    }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

### 2.2. POST /courses/:id/enroll
Đăng ký khóa học

**Response:** 201 Created
```json
{
  "message": "Enrolled successfully",
  "enrollment": {
    "id": 50,
    "course_id": 1,
    "student_id": 1,
    "enrolled_at": "2024-01-27T10:00:00Z",
    "status": "active"
  }
}
```

### 2.3. GET /courses/:id/lessons
Lấy danh sách bài học của khóa

**Response:** 200 OK
```json
{
  "data": [
    {
      "id": 1,
      "title": "Welcome to the course",
      "description": "Introduction lesson",
      "order_index": 1,
      "chapter_name": "Chapter 1: Basics",
      "content_type": "video",
      "duration_minutes": 30,
      "is_free": true,
      "materials": [
        {
          "id": 1,
          "file_type": "video",
          "file_url": "https://cdn.../video.mp4",
          "video_duration": 1800,
          "video_thumbnail_url": "https://...",
          "is_downloadable": false
        },
        {
          "id": 2,
          "file_type": "pdf",
          "file_name": "Lecture Notes.pdf",
          "file_url": "https://cdn.../notes.pdf",
          "is_downloadable": true
        }
      ],
      "my_progress": {
        "status": "completed",
        "progress_percentage": 100,
        "last_video_position": 1800,
        "completed_at": "2024-01-20T15:30:00Z"
      }
    }
  ]
}
```

### 2.4. POST /lessons/:id/progress
Cập nhật tiến độ học bài

**Request:**
```json
{
  "status": "in_progress",
  "progress_percentage": 45.5,
  "last_video_position": 810,  // seconds
  "time_spent_minutes": 15
}
```

**Response:** 200 OK
```json
{
  "message": "Progress updated",
  "progress": {
    "lesson_id": 1,
    "status": "in_progress",
    "progress_percentage": 45.5,
    "last_video_position": 810
  }
}
```

### 2.5. GET /exams
Lấy danh sách bài kiểm tra

**Query Params:**
```
?course_id=1
&type=midterm
&status=available  // available, completed, expired
```

**Response:** 200 OK
```json
{
  "data": [
    {
      "id": 1,
      "course_id": 1,
      "title": "Midterm Exam",
      "description": "Topics 1-5",
      "exam_type": "midterm",
      "total_marks": 100,
      "passing_marks": 70,
      "duration_minutes": 90,
      "available_from": "2024-02-01T08:00:00Z",
      "available_until": "2024-02-03T23:59:59Z",
      "max_attempts": 2,
      "my_attempts": [
        {
          "attempt_number": 1,
          "score": 75,
          "percentage": 75,
          "passed": true,
          "submitted_at": "2024-02-01T10:30:00Z"
        }
      ],
      "remaining_attempts": 1,
      "can_take": true
    }
  ]
}
```

### 2.6. POST /exams/:id/start
Bắt đầu làm bài

**Response:** 201 Created
```json
{
  "attempt": {
    "id": 100,
    "exam_id": 1,
    "attempt_number": 1,
    "started_at": "2024-02-01T09:00:00Z",
    "must_submit_before": "2024-02-01T10:30:00Z",
    "status": "in_progress"
  },
  "questions": [
    {
      "id": 1,
      "question_text": "What is the capital of Vietnam?",
      "question_type": "multiple_choice",
      "marks": 2.5,
      "options": [
        {"id": "A", "text": "Hanoi"},
        {"id": "B", "text": "Ho Chi Minh City"},
        {"id": "C", "text": "Da Nang"},
        {"id": "D", "text": "Can Tho"}
      ]
    },
    {
      "id": 2,
      "question_text": "Explain the concept of OOP",
      "question_type": "essay",
      "marks": 10,
      "essay_max_words": 500
    }
  ]
}
```

### 2.7. POST /exams/attempts/:id/answer
Lưu câu trả lời (có thể gọi nhiều lần)

**Request:**
```json
{
  "question_id": 1,
  "selected_option": "A",  // For MCQ
  "essay_answer": null,    // For essay
  "time_spent_seconds": 45
}
```

**Response:** 200 OK
```json
{
  "message": "Answer saved",
  "answer": {
    "question_id": 1,
    "selected_option": "A",
    "answered_at": "2024-02-01T09:02:30Z"
  }
}
```

### 2.8. POST /exams/attempts/:id/submit
Nộp bài

**Response:** 200 OK
```json
{
  "message": "Exam submitted successfully",
  "attempt": {
    "id": 100,
    "status": "submitted",
    "submitted_at": "2024-02-01T10:15:00Z",
    "duration_seconds": 4500,
    "score": null,  // Chưa chấm
    "auto_graded_at": null,
    "show_results_immediately": false
  },
  "notification": "You will be notified when results are available"
}
```

### 2.9. GET /exams/attempts/:id/result
Xem kết quả bài thi

**Response:** 200 OK
```json
{
  "attempt": {
    "id": 100,
    "exam_id": 1,
    "attempt_number": 1,
    "score": 82.5,
    "max_score": 100,
    "percentage": 82.5,
    "passed": true,
    "status": "graded",
    "submitted_at": "2024-02-01T10:15:00Z",
    "graded_at": "2024-02-01T15:00:00Z",
    "lecturer_feedback": "Good work! Focus more on essay structure."
  },
  "answers": [
    {
      "question_id": 1,
      "question_text": "What is the capital of Vietnam?",
      "your_answer": "A",
      "correct_answer": "A",
      "is_correct": true,
      "marks_awarded": 2.5,
      "marks_possible": 2.5,
      "explanation": "Hanoi has been the capital since 1976"
    },
    {
      "question_id": 2,
      "question_text": "Explain OOP",
      "your_answer": "Object-Oriented Programming is...",
      "is_correct": null,  // Essay - manually graded
      "marks_awarded": 8.0,
      "marks_possible": 10.0,
      "grading_notes": "Good explanation but missing some key concepts"
    }
  ]
}
```

### 2.10. GET /my/grades
Xem tất cả điểm của mình

**Query Params:**
```
?course_id=1
&grade_type=exam
```

**Response:** 200 OK
```json
{
  "data": [
    {
      "id": 1,
      "course": {
        "id": 1,
        "title": "Intro to Programming"
      },
      "grade_type": "exam",
      "exam": {
        "id": 1,
        "title": "Midterm"
      },
      "grade_value": 82.5,
      "max_value": 100,
      "percentage": 82.5,
      "weight": 30,  // 30% of final grade
      "graded_at": "2024-02-01T15:00:00Z",
      "comments": "Good work overall"
    }
  ],
  "summary": {
    "total_courses": 5,
    "average_grade": 78.5,
    "completed_exams": 12
  }
}
```

---

## 3. Lecturer APIs

### 3.1. POST /courses
Tạo khóa học mới

**Request:**
```json
{
  "code": "CS101",
  "title": "Introduction to Programming",
  "description": "Learn programming basics",
  "category": "Technology",
  "level": "beginner",
  "max_students": 100,
  "start_date": "2024-03-01T00:00:00Z",
  "end_date": "2024-06-01T00:00:00Z",
  "passing_score": 70
}
```

**Response:** 201 Created
```json
{
  "id": 1,
  "code": "CS101",
  "title": "Introduction to Programming",
  "lecturer_id": 10,
  "status": "draft",
  "created_at": "2024-01-27T10:00:00Z"
}
```

### 3.2. PUT /courses/:id
Cập nhật khóa học

### 3.3. DELETE /courses/:id
Xóa khóa học (soft delete)

### 3.4. POST /courses/:id/lessons
Tạo bài giảng mới

**Request:**
```json
{
  "title": "Introduction to Variables",
  "description": "Learn about variables in programming",
  "order_index": 1,
  "chapter_name": "Chapter 1: Basics",
  "content_type": "video",
  "duration_minutes": 30,
  "is_free": false,
  "is_mandatory": true
}
```

**Response:** 201 Created

### 3.5. POST /lessons/:id/materials
Upload file bài giảng

**Request:** `multipart/form-data`
```
file: video.mp4
title: "Introduction Video"
description: "..."
is_downloadable: true
```

**Response:** 201 Created
```json
{
  "id": 1,
  "lesson_id": 1,
  "file_type": "video",
  "file_name": "video.mp4",
  "file_url": "https://cdn.../abcd1234.mp4",
  "file_size": 52428800,
  "video_duration": 1800,
  "video_thumbnail_url": "https://cdn.../thumb.jpg"
}
```

### 3.6. POST /question-banks
Tạo ngân hàng câu hỏi

### 3.7. POST /question-banks/:id/questions
Thêm câu hỏi vào ngân hàng

**Request (MCQ):**
```json
{
  "question_type": "multiple_choice",
  "question_text": "What is the capital of Vietnam?",
  "marks": 2.5,
  "difficulty_level": "easy",
  "topic": "Geography",
  "options": [
    {"id": "A", "text": "Hanoi", "is_correct": true},
    {"id": "B", "text": "HCMC", "is_correct": false},
    {"id": "C", "text": "Da Nang", "is_correct": false},
    {"id": "D", "text": "Can Tho", "is_correct": false}
  ],
  "explanation": "Hanoi has been Vietnam's capital since 1976"
}
```

**Request (Essay):**
```json
{
  "question_type": "essay",
  "question_text": "Explain the concept of OOP",
  "marks": 10,
  "difficulty_level": "medium",
  "topic": "Programming",
  "essay_max_words": 500,
  "essay_keywords": ["encapsulation", "inheritance", "polymorphism", "abstraction"]
}
```

**Response:** 201 Created

### 3.8. POST /courses/:id/exams
Tạo bài kiểm tra

**Request:**
```json
{
  "title": "Midterm Exam",
  "description": "Topics 1-5",
  "exam_type": "midterm",
  "total_marks": 100,
  "passing_marks": 70,
  "duration_minutes": 90,
  "available_from": "2024-02-01T08:00:00Z",
  "available_until": "2024-02-03T23:59:59Z",
  "max_attempts": 2,
  "shuffle_questions": true,
  "shuffle_options": true,
  "show_results_immediately": false,
  "show_correct_answers": false,
  "is_proctored": false,
  "question_ids": [1, 2, 3, 4, 5],  // Từ question bank
  "random_question_count": null  // Hoặc số câu random
}
```

**Response:** 201 Created

### 3.9. GET /exams/:id/attempts
Xem danh sách bài làm của học sinh

**Query Params:**
```
?status=submitted  // graded, in_progress, submitted
&student_id=5
```

**Response:** 200 OK
```json
{
  "data": [
    {
      "id": 100,
      "student": {
        "id": 5,
        "full_name": "Nguyen Van A",
        "student_code": "SV001"
      },
      "attempt_number": 1,
      "started_at": "2024-02-01T09:00:00Z",
      "submitted_at": "2024-02-01T10:15:00Z",
      "duration_seconds": 4500,
      "status": "submitted",
      "score": null,
      "needs_grading": true  // Có câu essay chưa chấm
    }
  ]
}
```

### 3.10. POST /exams/attempts/:id/grade
Chấm điểm thủ công (essay)

**Request:**
```json
{
  "answers": [
    {
      "question_id": 2,
      "marks_awarded": 8.0,
      "marks_possible": 10.0,
      "grading_notes": "Good but missing key concepts"
    }
  ],
  "lecturer_feedback": "Overall good work. Focus more on structure."
}
```

**Response:** 200 OK
```json
{
  "message": "Graded successfully",
  "attempt": {
    "id": 100,
    "status": "graded",
    "score": 82.5,
    "percentage": 82.5,
    "passed": true,
    "graded_at": "2024-02-01T15:00:00Z"
  }
}
```

### 3.11. GET /courses/:id/analytics
Xem thống kê khóa học

**Response:** 200 OK
```json
{
  "course": {
    "id": 1,
    "title": "Intro to Programming"
  },
  "stats": {
    "total_enrolled": 150,
    "active_students": 120,
    "completed_students": 30,
    "average_completion_rate": 65.5,
    "average_grade": 78.5,
    "pass_rate": 85.0
  },
  "lesson_stats": [
    {
      "lesson_id": 1,
      "title": "Introduction",
      "completion_rate": 95.0,
      "average_time_spent": 25
    }
  ],
  "exam_stats": [
    {
      "exam_id": 1,
      "title": "Midterm",
      "total_attempts": 120,
      "average_score": 78.5,
      "pass_rate": 85.0,
      "highest_score": 98.0,
      "lowest_score": 45.0
    }
  ]
}
```

### 3.12. GET /courses/:id/students
Xem danh sách học sinh trong khóa

**Response:** 200 OK
```json
{
  "data": [
    {
      "student_id": 5,
      "full_name": "Nguyen Van A",
      "student_code": "SV001",
      "email": "student@example.com",
      "enrollment": {
        "enrolled_at": "2024-01-15T10:00:00Z",
        "progress_percentage": 65.5,
        "status": "active",
        "last_accessed_at": "2024-01-27T09:00:00Z"
      },
      "grades": {
        "average": 78.5,
        "exams_completed": 2,
        "total_exams": 3
      }
    }
  ]
}
```

### 3.13. GET /courses/:id/export-grades
Export điểm ra Excel/CSV

**Query Params:**
```
?format=xlsx  // xlsx, csv
```

**Response:** File download

---

## 4. Admin APIs

### 4.1. GET /admin/users
Quản lý người dùng

**Query Params:**
```
?role=student
&search=nguyen
&status=active
&page=1
&limit=50
```

**Response:** 200 OK
```json
{
  "data": [
    {
      "id": 1,
      "email": "student@example.com",
      "full_name": "Nguyen Van A",
      "role": "student",
      "student_code": "SV001",
      "is_active": true,
      "is_email_verified": true,
      "last_login_at": "2024-01-27T09:00:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {...}
}
```

### 4.2. PUT /admin/users/:id/role
Thay đổi role

**Request:**
```json
{
  "role": "lecturer",
  "lecturer_code": "GV001",
  "department": "Computer Science"
}
```

### 4.3. PUT /admin/users/:id/status
Kích hoạt/vô hiệu hóa user

**Request:**
```json
{
  "is_active": false,
  "reason": "Violation of terms"
}
```

### 4.4. GET /admin/dashboard
Dashboard thống kê tổng quan

**Response:** 200 OK
```json
{
  "users": {
    "total": 10100,
    "students": 10000,
    "lecturers": 100,
    "admins": 5,
    "new_this_month": 250
  },
  "courses": {
    "total": 500,
    "published": 450,
    "draft": 50,
    "active": 420
  },
  "exams": {
    "total": 2000,
    "in_progress": 50,
    "completed": 15000  // Tổng số lượt làm
  },
  "activity": {
    "active_students_today": 3500,
    "exams_taken_today": 250,
    "lessons_completed_today": 1500
  }
}
```

### 4.5. GET /admin/audit-logs
Xem audit logs

**Query Params:**
```
?user_id=5
&action=deleted
&entity_type=exam
&from=2024-01-01
&to=2024-01-31
```

**Response:** 200 OK
```json
{
  "data": [
    {
      "id": 1000,
      "user_email": "admin@example.com",
      "action": "deleted",
      "entity_type": "exam",
      "entity_id": 10,
      "old_values": {"title": "Old Exam"},
      "ip_address": "192.168.1.1",
      "created_at": "2024-01-27T10:00:00Z"
    }
  ]
}
```

---

## 5. Notification APIs

### 5.1. GET /notifications
Lấy thông báo của mình

**Query Params:**
```
?is_read=false
&limit=20
```

**Response:** 200 OK
```json
{
  "data": [
    {
      "id": 1,
      "type": "grade_published",
      "title": "Điểm thi đã được công bố",
      "message": "Điểm Midterm Exam của bạn đã có",
      "related_entity_type": "exam",
      "related_entity_id": 1,
      "action_url": "/exams/attempts/100/result",
      "is_read": false,
      "priority": "high",
      "created_at": "2024-02-01T15:00:00Z"
    }
  ],
  "unread_count": 5
}
```

### 5.2. PUT /notifications/:id/read
Đánh dấu đã đọc

### 5.3. PUT /notifications/read-all
Đánh dấu tất cả đã đọc

---

## 6. Common Features

### 6.1. Pagination
Tất cả list endpoints đều support pagination:
```
?page=1&limit=20
```

### 6.2. Sorting
```
?sort_by=created_at&order=desc
```

### 6.3. Filtering
```
?status=active&category=technology
```

### 6.4. Search
```
?search=programming
```

---

## 7. Error Responses

### Standard Error Format:
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Email is required"
    }
  ],
  "timestamp": "2024-01-27T10:00:00Z",
  "path": "/auth/register"
}
```

### Common Status Codes:
- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No permission
- `404 Not Found` - Resource not found
- `409 Conflict` - Duplicate resource
- `422 Unprocessable Entity` - Business logic error
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

---

## Summary

✅ **Total Endpoints:** ~50+ APIs  
✅ **Authentication:** JWT RS256 (already implemented)  
✅ **Authorization:** Role-based (need to implement)  
✅ **Pagination:** Supported on all list endpoints  
✅ **File Upload:** Multipart form-data  
✅ **Real-time:** WebSocket for notifications (optional)

Tiếp theo: Exam Flow và Grading System chi tiết
