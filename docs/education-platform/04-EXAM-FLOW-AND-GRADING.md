# Education Platform - Exam Flow & Grading System

## 1. Exam Taking Flow

### 1.1. Overall Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    EXAM FLOW OVERVIEW                         │
└──────────────────────────────────────────────────────────────┘

Student                   Backend                    Database
   │                         │                          │
   ├─1. Check Available─────>│                          │
   │   GET /exams           │                          │
   │<──List of exams─────────┤                          │
   │                         │                          │
   ├─2. Start Exam──────────>│                          │
   │   POST /exams/:id/start│                          │
   │                         ├──Create ExamAttempt────>│
   │                         ├──Shuffle Questions──────>│
   │                         ├──Save to Redis Session─>│
   │<──Questions + Session───┤                          │
   │                         │                          │
   ├─3. Answer Questions────>│                          │
   │   POST /attempts/:id/   │                          │
   │   answer (multiple)     ├──Save Answer────────────>│
   │<──OK (x10)──────────────┤                          │
   │                         │                          │
   ├─4. Submit Exam─────────>│                          │
   │   POST /attempts/:id/   │                          │
   │   submit                ├──Mark as Submitted──────>│
   │                         ├──Queue Auto-Grading────>│
   │<──Submitted─────────────┤    (Background Job)      │
   │                         │                          │
   │                         │──Auto-grade MCQ─────────>│
   │                         │    (in 5-10 seconds)     │
   │                         │                          │
   │                         │──Notify Lecturer────────>│
   │                         │    (Essay needs grading) │
   │                         │                          │
   │                         │<─Lecturer grades Essay───│
   │                         │                          │
   │                         ├──Calculate Final Score─>│
   │                         ├──Save Grade─────────────>│
   │                         ├──Send Notification─────>│
   │                         │                          │
   │<──Notification──────────┤                          │
   │   (Your result ready)   │                          │
   │                         │                          │
   ├─5. View Result─────────>│                          │
   │   GET /attempts/:id/    │                          │
   │   result                ├──Fetch Result───────────>│
   │<──Detailed Result───────┤                          │
   │                         │                          │
```

---

## 2. Detailed Exam Flow Steps

### Step 1: Student Checks Available Exams

**API:** `GET /exams?course_id=1&status=available`

**Backend Logic:**
```typescript
async getAvailableExams(studentId: number, courseId: number) {
  const now = new Date();
  
  // Lấy exams available
  const exams = await this.examRepository.find({
    where: {
      course_id: courseId,
      status: 'published',
      available_from: LessThanOrEqual(now),
      available_until: MoreThanOrEqual(now)
    }
  });
  
  // Kiểm tra attempts của student
  for (const exam of exams) {
    const attempts = await this.attemptRepository.count({
      where: {
        exam_id: exam.id,
        student_id: studentId
      }
    });
    
    exam.my_attempts = attempts;
    exam.remaining_attempts = exam.max_attempts - attempts;
    exam.can_take = attempts < exam.max_attempts;
  }
  
  return exams;
}
```

---

### Step 2: Start Exam

**API:** `POST /exams/:id/start`

**Backend Logic:**
```typescript
async startExam(examId: number, studentId: number, deviceInfo: DeviceInfo) {
  // 1. Validate eligibility
  const exam = await this.examRepository.findOne(examId);
  
  if (!exam) throw new NotFoundException('Exam not found');
  if (exam.available_from > new Date()) 
    throw new BadRequestException('Exam not yet available');
  if (exam.available_until < new Date()) 
    throw new BadRequestException('Exam expired');
  
  // 2. Check enrollment
  const enrollment = await this.enrollmentRepository.findOne({
    where: { course_id: exam.course_id, student_id: studentId }
  });
  if (!enrollment) throw new ForbiddenException('Not enrolled');
  
  // 3. Check max attempts
  const attemptCount = await this.attemptRepository.count({
    where: { exam_id: examId, student_id: studentId }
  });
  if (attemptCount >= exam.max_attempts) 
    throw new BadRequestException('Max attempts reached');
  
  // 4. Check concurrent attempts
  const activeAttempt = await this.attemptRepository.findOne({
    where: { 
      exam_id: examId, 
      student_id: studentId,
      status: 'in_progress'
    }
  });
  if (activeAttempt) 
    throw new BadRequestException('You have an active attempt');
  
  // 5. Load questions
  let questions = await this.getExamQuestions(examId);
  
  // 6. Shuffle questions if enabled
  if (exam.shuffle_questions) {
    questions = this.shuffleArray(questions);
  }
  
  // 7. Shuffle options for each question
  if (exam.shuffle_options) {
    questions = questions.map(q => ({
      ...q,
      options: q.question_type === 'multiple_choice' 
        ? this.shuffleArray(q.options) 
        : q.options
    }));
  }
  
  // 8. Create snapshot (lưu thứ tự đã shuffle)
  const questionsSnapshot = questions.map((q, index) => ({
    question_id: q.id,
    order: index + 1,
    marks: q.marks,
    shuffled_options: q.options?.map(o => o.id) || null
  }));
  
  // 9. Create exam attempt
  const attempt = await this.attemptRepository.save({
    exam_id: examId,
    student_id: studentId,
    attempt_number: attemptCount + 1,
    started_at: new Date(),
    status: 'in_progress',
    questions_snapshot: questionsSnapshot,
    ip_address: deviceInfo.ipAddress,
    user_agent: deviceInfo.userAgent
  });
  
  // 10. Save session to Redis (với TTL = exam duration)
  const sessionKey = `exam_session:${attempt.id}`;
  await this.redis.setex(
    sessionKey,
    exam.duration_minutes * 60,
    JSON.stringify({
      attempt_id: attempt.id,
      exam_id: examId,
      student_id: studentId,
      started_at: attempt.started_at,
      must_submit_before: new Date(
        attempt.started_at.getTime() + exam.duration_minutes * 60 * 1000
      )
    })
  );
  
  // 11. Remove correct answers from questions
  const questionsForStudent = questions.map(q => {
    if (q.question_type === 'multiple_choice') {
      return {
        ...q,
        options: q.options.map(({ is_correct, ...rest }) => rest),
        correct_answer: undefined,
        explanation: undefined
      };
    }
    return {
      ...q,
      correct_answer: undefined,
      explanation: undefined
    };
  });
  
  return {
    attempt,
    questions: questionsForStudent,
    must_submit_before: new Date(
      attempt.started_at.getTime() + exam.duration_minutes * 60 * 1000
    )
  };
}
```

---

### Step 3: Student Answers Questions

**API:** `POST /exams/attempts/:id/answer`

**Backend Logic:**
```typescript
async saveAnswer(
  attemptId: number,
  questionId: number,
  answerData: SaveAnswerDto,
  studentId: number
) {
  // 1. Validate session
  const session = await this.validateExamSession(attemptId, studentId);
  
  // 2. Check time limit
  if (new Date() > session.must_submit_before) {
    // Auto-submit
    await this.autoSubmitExam(attemptId);
    throw new BadRequestException('Time expired - exam auto-submitted');
  }
  
  // 3. Validate attempt status
  const attempt = await this.attemptRepository.findOne(attemptId);
  if (attempt.status !== 'in_progress') 
    throw new BadRequestException('Attempt not active');
  
  // 4. Validate question belongs to exam
  const questionExists = attempt.questions_snapshot.some(
    q => q.question_id === questionId
  );
  if (!questionExists) 
    throw new BadRequestException('Invalid question');
  
  // 5. Upsert answer
  await this.answerRepository.upsert({
    attempt_id: attemptId,
    question_id: questionId,
    selected_option: answerData.selected_option,
    essay_answer: answerData.essay_answer,
    fill_blank_answer: answerData.fill_blank_answer,
    answered_at: new Date(),
    time_spent_seconds: answerData.time_spent_seconds
  }, ['attempt_id', 'question_id']);
  
  // 6. Update Redis session (last activity)
  await this.redis.expire(
    `exam_session:${attemptId}`,
    session.remaining_seconds
  );
  
  return { message: 'Answer saved' };
}
```

---

### Step 4: Submit Exam

**API:** `POST /exams/attempts/:id/submit`

**Backend Logic:**
```typescript
async submitExam(attemptId: number, studentId: number) {
  // 1. Validate session
  const session = await this.validateExamSession(attemptId, studentId);
  
  // 2. Get attempt
  const attempt = await this.attemptRepository.findOne(attemptId, {
    relations: ['exam']
  });
  
  if (attempt.status !== 'in_progress') 
    throw new BadRequestException('Attempt already submitted');
  
  // 3. Calculate duration
  const durationSeconds = Math.floor(
    (Date.now() - attempt.started_at.getTime()) / 1000
  );
  
  // 4. Update attempt
  await this.attemptRepository.update(attemptId, {
    status: 'submitted',
    submitted_at: new Date(),
    duration_seconds: durationSeconds
  });
  
  // 5. Clear Redis session
  await this.redis.del(`exam_session:${attemptId}`);
  
  // 6. Queue auto-grading job
  await this.gradingQueue.add('auto-grade-exam', {
    attempt_id: attemptId,
    exam_id: attempt.exam_id
  });
  
  return {
    message: 'Exam submitted successfully',
    show_results_immediately: attempt.exam.show_results_immediately
  };
}
```

---

## 3. Auto-Grading System

### 3.1. Auto-Grading Queue Processor

```typescript
@Processor('grading')
export class GradingProcessor {
  
  @Process('auto-grade-exam')
  async autoGradeExam(job: Job<{ attempt_id: number; exam_id: number }>) {
    const { attempt_id } = job.data;
    
    // 1. Get attempt with answers and questions
    const attempt = await this.attemptRepository.findOne(attempt_id, {
      relations: ['answers', 'exam']
    });
    
    // 2. Get all questions with correct answers
    const questionIds = attempt.questions_snapshot.map(q => q.question_id);
    const questions = await this.questionRepository.findByIds(questionIds);
    const questionMap = new Map(questions.map(q => [q.id, q]));
    
    let totalScore = 0;
    let totalPossible = 0;
    let hasEssay = false;
    
    // 3. Grade each answer
    for (const answer of attempt.answers) {
      const question = questionMap.get(answer.question_id);
      const marks_possible = question.marks;
      totalPossible += marks_possible;
      
      let marks_awarded = 0;
      let is_correct = false;
      
      // Grade based on question type
      switch (question.question_type) {
        
        case 'multiple_choice':
        case 'true_false':
          // Simple comparison
          const correctOption = question.options.find(o => o.is_correct);
          is_correct = answer.selected_option === correctOption.id;
          marks_awarded = is_correct ? marks_possible : 0;
          break;
        
        case 'fill_blank':
          // Check against possible answers (case-insensitive)
          const studentAnswer = answer.fill_blank_answer.trim().toLowerCase();
          is_correct = question.blank_answers.some(
            ans => ans.toLowerCase() === studentAnswer
          );
          marks_awarded = is_correct ? marks_possible : 0;
          break;
        
        case 'essay':
          // Mark as needs manual grading
          hasEssay = true;
          marks_awarded = null;
          is_correct = null;
          break;
      }
      
      // Update answer
      await this.answerRepository.update(answer.id, {
        is_correct,
        marks_awarded,
        marks_possible,
        graded_at: question.question_type !== 'essay' ? new Date() : null
      });
      
      if (marks_awarded !== null) {
        totalScore += marks_awarded;
      }
    }
    
    // 4. Update attempt
    const updateData: any = {
      auto_graded_at: new Date(),
      max_score: totalPossible
    };
    
    if (!hasEssay) {
      // Fully graded
      updateData.status = 'graded';
      updateData.score = totalScore;
      updateData.percentage = (totalScore / totalPossible) * 100;
      updateData.passed = updateData.percentage >= attempt.exam.passing_marks;
      updateData.manually_graded_at = new Date();
      
      // Create grade record
      await this.createGradeRecord(attempt, totalScore, totalPossible);
      
      // Send notification to student
      await this.notificationService.send({
        user_id: attempt.student_id,
        type: 'grade_published',
        title: 'Điểm thi đã có',
        message: `Điểm của bạn: ${totalScore}/${totalPossible}`,
        related_entity_type: 'exam_attempt',
        related_entity_id: attempt.id
      });
    } else {
      // Needs manual grading
      updateData.status = 'submitted';
      updateData.score = null;
      
      // Notify lecturer
      await this.notificationService.send({
        user_id: attempt.exam.lecturer_id,
        type: 'grading_needed',
        title: 'Bài thi cần chấm',
        message: `${attempt.student.full_name} đã nộp bài`,
        related_entity_type: 'exam_attempt',
        related_entity_id: attempt.id
      });
    }
    
    await this.attemptRepository.update(attempt_id, updateData);
    
    return { success: true, hasEssay };
  }
}
```

---

## 4. Manual Grading System (Lecturer)

### 4.1. Grade Essay Question

**API:** `POST /exams/attempts/:id/grade`

**Backend Logic:**
```typescript
async gradeAttempt(
  attemptId: number,
  gradeData: GradeAttemptDto,
  lecturerId: number
) {
  // 1. Get attempt
  const attempt = await this.attemptRepository.findOne(attemptId, {
    relations: ['exam', 'answers', 'answers.question']
  });
  
  // 2. Validate lecturer owns this exam
  if (attempt.exam.lecturer_id !== lecturerId) 
    throw new ForbiddenException('Not your exam');
  
  // 3. Grade each answer
  for (const gradeAnswer of gradeData.answers) {
    const answer = attempt.answers.find(
      a => a.question_id === gradeAnswer.question_id
    );
    
    if (!answer) continue;
    
    await this.answerRepository.update(answer.id, {
      marks_awarded: gradeAnswer.marks_awarded,
      grading_notes: gradeAnswer.grading_notes,
      is_correct: gradeAnswer.marks_awarded === answer.marks_possible,
      graded_at: new Date(),
      graded_by_lecturer_id: lecturerId
    });
  }
  
  // 4. Calculate final score
  const allAnswers = await this.answerRepository.find({
    where: { attempt_id: attemptId }
  });
  
  const totalScore = allAnswers.reduce(
    (sum, ans) => sum + (ans.marks_awarded || 0), 
    0
  );
  const totalPossible = allAnswers.reduce(
    (sum, ans) => sum + ans.marks_possible, 
    0
  );
  const percentage = (totalScore / totalPossible) * 100;
  const passed = percentage >= attempt.exam.passing_marks;
  
  // 5. Update attempt
  await this.attemptRepository.update(attemptId, {
    status: 'graded',
    score: totalScore,
    max_score: totalPossible,
    percentage,
    passed,
    manually_graded_at: new Date(),
    graded_by_lecturer_id: lecturerId,
    lecturer_feedback: gradeData.lecturer_feedback
  });
  
  // 6. Create grade record
  await this.createGradeRecord(attempt, totalScore, totalPossible);
  
  // 7. Notify student
  await this.notificationService.send({
    user_id: attempt.student_id,
    type: 'grade_published',
    title: 'Điểm thi đã được công bố',
    message: `Điểm ${attempt.exam.title}: ${totalScore}/${totalPossible}`,
    related_entity_type: 'exam_attempt',
    related_entity_id: attemptId,
    priority: 'high'
  });
  
  return {
    message: 'Graded successfully',
    score: totalScore,
    percentage,
    passed
  };
}
```

---

## 5. Anti-Cheating Measures

### 5.1. Question & Option Shuffling

```typescript
// Questions are shuffled when exam starts
// Snapshot is saved to exam_attempts.questions_snapshot
const questionsSnapshot = shuffledQuestions.map((q, index) => ({
  question_id: q.id,
  order: index + 1,
  marks: q.marks,
  shuffled_options: q.options?.map(o => o.id) || null
}));
```

### 5.2. Session Validation

```typescript
async validateExamSession(attemptId: number, studentId: number) {
  // Check Redis session
  const sessionKey = `exam_session:${attemptId}`;
  const session = await this.redis.get(sessionKey);
  
  if (!session) {
    throw new UnauthorizedException('Session expired or invalid');
  }
  
  const sessionData = JSON.parse(session);
  
  if (sessionData.student_id !== studentId) {
    throw new ForbiddenException('Invalid session');
  }
  
  return sessionData;
}
```

### 5.3. Tab Switch Detection (Optional)

```typescript
// Frontend tracks tab switches
let tabSwitchCount = 0;

document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    tabSwitchCount++;
    
    // Report to backend
    await api.post(`/exams/attempts/${attemptId}/suspicious-activity`, {
      type: 'tab_switch',
      timestamp: new Date()
    });
    
    if (tabSwitchCount > 3) {
      alert('Warning: Multiple tab switches detected!');
    }
  }
});
```

**Backend saves to DB:**
```typescript
await this.attemptRepository.update(attemptId, {
  tab_switches_count: () => 'tab_switches_count + 1',
  suspicious_activities: () => `suspicious_activities || '${JSON.stringify({
    type: 'tab_switch',
    timestamp: new Date()
  })}'::jsonb`
});
```

### 5.4. Time Limit Enforcement

```typescript
// Auto-submit when time expires
async autoSubmitExam(attemptId: number) {
  const attempt = await this.attemptRepository.findOne(attemptId);
  
  if (attempt.status !== 'in_progress') return;
  
  await this.attemptRepository.update(attemptId, {
    status: 'expired',
    submitted_at: new Date(),
    duration_seconds: attempt.exam.duration_minutes * 60
  });
  
  // Queue grading
  await this.gradingQueue.add('auto-grade-exam', {
    attempt_id: attemptId,
    exam_id: attempt.exam_id
  });
}
```

---

## 6. Grading Workflow Summary

```
┌──────────────────────────────────────────────────────┐
│            GRADING WORKFLOW                          │
└──────────────────────────────────────────────────────┘

Submit → Auto-grade MCQ/Fill-blank → Needs essay?
                  │                        │
                  NO                      YES
                  │                        │
                  ↓                        ↓
          Status: graded          Status: submitted
          Notify student          Notify lecturer
                                        │
                                        ↓
                              Lecturer grades essay
                                        │
                                        ↓
                              Calculate final score
                                        │
                                        ↓
                              Status: graded
                              Notify student
```

---

## Summary

✅ **Security Features:**
- Question shuffling
- Option shuffling
- Session validation (Redis)
- Time limit enforcement
- Anti-cheating detection
- Question snapshot (prevents tampering)

✅ **Performance:**
- Auto-grading runs in background queue
- Redis for fast session checks
- Batch processing for large exams

✅ **Flexibility:**
- Multiple question types
- Mixed auto/manual grading
- Configurable attempts
- Configurable time limits

✅ **User Experience:**
- Immediate feedback for MCQ (optional)
- Detailed results with explanations
- Real-time notifications
- Progress tracking

Tiếp theo: Implementation Roadmap
