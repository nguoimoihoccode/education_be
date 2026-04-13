# Quiz/Trắc nghiệm System Implementation Plan

## Context

Hệ thống flashcard hiện tại đã hỗ trợ phân loại theo chủ đề (HSK1, HSK2, HSK3,...). Người dùng cần một hệ thống trắc nghiệm/quiz để:
- Tạo quiz ngẫu nhiên từ flashcards theo chủ đề
- Hỗ trợ nhiều loại câu hỏi (multiple choice, true/false, fill in the blank)
- Theo dõi điểm số và tiến độ học tập
- Xem lại câu trả lời sai
- Cá nhân hóa độ khó dựa trên trình độ người dùng

## Implementation Strategy

### Phase 1: Database Schema & Entities

#### New Entities to Create

**1. Quiz** (`edu_quizzes`)
```typescript
@Entity('edu_quizzes')
export class Quiz {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  topic: string; // HSK1, HSK2, HSK3, etc.

  @Column({
    type: 'enum',
    enum: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MIXED'],
    default: 'MIXED',
  })
  questionType: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK' | 'MIXED';

  @Column({ default: 10 })
  questionCount: number;

  @Column({ default: 60 })
  timeLimit: number; // seconds

  @Column({ default: 0 })
  passingScore: number; // percentage

  @Column({ type: 'enum', enum: ['EASY', 'MEDIUM', 'HARD', 'MIXED'], default: 'MIXED' })
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED';

  @Column({ default: true })
  isPublic: boolean;

  @Column({ default: true })
  shuffleQuestions: boolean;

  @Column({ default: true })
  shuffleAnswers: boolean;

  @Column({ default: false })
  showCorrectAnswer: boolean;

  @Column({ default: false })
  allowRetry: boolean;

  @Column({ default: 0 })
  maxRetries: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @OneToMany(() => QuizQuestion, (question) => question.quiz)
  questions: QuizQuestion[];

  @OneToMany(() => QuizSession, (session) => session.quiz)
  sessions: QuizSession[];
}
```

**2. QuizQuestion** (`edu_quiz_questions`)
```typescript
@Entity('edu_quiz_questions')
export class QuizQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'enum', enum: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK'] })
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK';

  @Column({ type: 'json' })
  options: string[]; // For multiple choice

  @Column()
  correctAnswer: string;

  @Column({ type: 'text', nullable: true })
  explanation: string;

  @Column({ default: 1 })
  points: number;

  @Column({ default: 0 })
  order: number;

  @Column({ nullable: true })
  flashcardId: string; // Link to original flashcard

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Quiz)
  @JoinColumn({ name: 'quizId' })
  quiz: Quiz;

  @Column()
  quizId: string;
}
```

**3. QuizSession** (`edu_quiz_sessions`)
```typescript
@Entity('edu_quiz_sessions')
export class QuizSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 0 })
  score: number; // percentage

  @Column({ default: 0 })
  totalPoints: number;

  @Column({ default: 0 })
  earnedPoints: number;

  @Column({ default: 0 })
  correctAnswers: number;

  @Column({ default: 0 })
  wrongAnswers: number;

  @Column({ default: 0 })
  skippedAnswers: number;

  @Column({ type: 'int', default: 0 })
  timeSpent: number; // seconds

  @Column({ default: false })
  passed: boolean;

  @Column({ default: false })
  completed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'json', nullable: true })
  answers: QuizAnswer[];

  @Column({ default: 0 })
  attemptNumber: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @ManyToOne(() => Quiz)
  @JoinColumn({ name: 'quizId' })
  quiz: Quiz;

  @Column()
  quizId: string;

  @Index(['userId', 'quizId'])
  @Index(['userId', 'startedAt'])
}
```

**4. QuizAnswer** (Interface for QuizSession.answers)
```typescript
export interface QuizAnswer {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  timeSpent: number;
  points: number;
}
```

### Phase 2: DTOs Structure

**Quiz DTOs** (`quiz.dto.ts`)
```typescript
export class CreateQuizDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  topic?: string;

  @IsEnum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MIXED'])
  @IsOptional()
  questionType?: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK' | 'MIXED';

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  questionCount?: number;

  @IsNumber()
  @Min(30)
  @Max(3600)
  @IsOptional()
  timeLimit?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  passingScore?: number;

  @IsEnum(['EASY', 'MEDIUM', 'HARD', 'MIXED'])
  @IsOptional()
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED';

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsBoolean()
  @IsOptional()
  shuffleQuestions?: boolean;

  @IsBoolean()
  @IsOptional()
  shuffleAnswers?: boolean;

  @IsBoolean()
  @IsOptional()
  showCorrectAnswer?: boolean;

  @IsBoolean()
  @IsOptional()
  allowRetry?: boolean;

  @IsNumber()
  @Min(0)
  @Max(10)
  @IsOptional()
  maxRetries?: number;
}

export class UpdateQuizDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  topic?: string;

  @IsEnum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MIXED'])
  @IsOptional()
  questionType?: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK' | 'MIXED';

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  questionCount?: number;

  @IsNumber()
  @Min(30)
  @Max(3600)
  @IsOptional()
  timeLimit?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  passingScore?: number;

  @IsEnum(['EASY', 'MEDIUM', 'HARD', 'MIXED'])
  @IsOptional()
  difficulty?: 'EASY' | 'MIXED';

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsBoolean()
  @IsOptional()
  shuffleQuestions?: boolean;

  @IsBoolean()
  @IsOptional()
  shuffleAnswers?: boolean;

  @IsBoolean()
  @IsOptional()
  showCorrectAnswer?: boolean;

  @IsBoolean()
  @IsOptional()
  allowRetry?: boolean;

  @IsNumber()
  @Min(0)
  @Max(10)
  @IsOptional()
  maxRetries?: number;
}
```

**Quiz Question DTOs** (`quiz-question.dto.ts`)
```typescript
export class CreateQuizQuestionDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsEnum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK'])
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @IsString()
  @IsNotEmpty()
  correctAnswer: string;

  @IsString()
  @IsOptional()
  explanation?: string;

  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  points?: number;

  @IsString()
  @IsOptional()
  flashcardId?: string;
}

export class BulkCreateQuizQuestionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuizQuestionDto)
  questions: CreateQuizQuestionDto[];
}

export class UpdateQuizQuestionDto {
  @IsString()
  @IsOptional()
  question?: string;

  @IsEnum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK'])
  @IsOptional()
  type?: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @IsString()
  @IsOptional()
  correctAnswer?: string;

  @IsString()
  @IsOptional()
  explanation?: string;

  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  points?: string;
}
```

**Quiz Session DTOs** (`quiz-session.dto.ts`)
```typescript
export class StartQuizSessionDto {
  @IsString()
  @IsNotEmpty()
  quizId: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  questionCount?: number;
}

export class SubmitQuizAnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsNotEmpty()
  answer: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  timeSpent?: number;
}

export class CompleteQuizSessionDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}

export class GenerateQuizFromFlashcardsDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  topic?: string;

  @IsString()
  @IsOptional()
  deckId?: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  questionCount?: number;

  @IsEnum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MIXED'])
  @IsOptional()
  questionType?: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK' | 'MIXED';

  @IsEnum(['EASY', 'MEDIUM', 'HARD', 'MIXED'])
  @IsOptional()
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED';

  @IsNumber()
  @Min(30)
  @Max(3600)
  @IsOptional()
  timeLimit?: number;
}
```

### Phase 3: Service Implementation

**QuizService** (`src/modules/education/quiz.service.ts`)

**Key Methods:**

1. **Quiz Management**
```typescript
async createQuiz(userId: number, dto: CreateQuizDto)
async getQuizzes(userId: number, page?: number, limit?: number, topic?: string)
async getQuizById(quizId: string, userId: number)
async updateQuiz(quizId: string, userId: number, dto: UpdateQuizDto)
async deleteQuiz(quizId: string, userId: number)
async getPublicQuizzes(page?: number, limit?: number)
```

2. **Quiz Question Management**
```typescript
async createQuizQuestion(userId: number, quizId: string, dto: CreateQuizQuestionDto)
async bulkCreateQuizQuestions(userId: number, quizId: string, dto: BulkCreateQuizQuestionDto)
async getQuizQuestions(quizId: string, userId: number)
async updateQuizQuestion(questionId: string, userId: number, dto: UpdateQuizQuestionDto)
async deleteQuizQuestion(questionId: string, userId: number)
```

3. **Generate Quiz from Flashcards**
```typescript
async generateQuizFromFlashcards(userId: number, dto: GenerateQuizFromFlashcardsDto)
private generateMultipleChoiceQuestion(flashcard: Flashcard): QuizQuestion
private generateTrueFalseQuestion(flashcard: Flashcard): QuizQuestion
private generateFillBlankQuestion(flashcard: Flashcard): QuizQuestion
private getRandomFlashcards(userId: number, topic?: string, deckId?: string, count: number, difficulty?: string)
private shuffleArray<T>(array: T[]): T[]
```

4. **Quiz Session Management**
```typescript
async startQuizSession(userId: number, dto: StartQuizSessionDto)
async submitQuizAnswer(userId: number, sessionId: string, dto: SubmitQuizAnswerDto)
async completeQuizSession(userId: number, dto: CompleteQuizSessionDto)
async getQuizSession(sessionId: string, userId: number)
async getQuizSessions(userId: number, quizId?: string, page?: number, limit?: number)
```

5. **Statistics & Progress**
```typescript
async getQuizStats(userId: number)
async getQuizStatsByTopic(userId: number, topic: string)
async getQuizHistory(userId: number, page?: number, limit?: number)
async getWrongAnswers(userId: number, sessionId?: string)
async getLeaderboard(quizId: string, page?: number, limit?: number)
```

**Question Generation Logic:**
```typescript
private generateMultipleChoiceQuestion(flashcard: Flashcard): Partial<CreateQuizQuestionDto> {
  // Generate 4 options: 1 correct + 3 wrong
  const wrongAnswers = await this.getRandomWrongAnswers(flashcard.back, 3);
  const options = this.shuffleArray([flashcard.back, ...wrongAnswers]);

  return {
    question: `What is the meaning of "${flashcard.front}"?`,
    type: 'MULTIPLE_CHOICE',
    options,
    correctAnswer: flashcard.back,
    explanation: flashcard.example || `The correct answer is "${flashcard.back}"`,
    points: 1,
    flashcardId: flashcard.id,
  };
}

private generateTrueFalseQuestion(flashcard: Flashcard): Partial<CreateQuizQuestionDto> {
  const isCorrect = Math.random() > 0.5;
  const statement = isCorrect
    ? `"${flashcard.front}" means "${flashcard.back}"`
    : `"${flashcard.front}" means "${await this.getRandomWrongAnswer(flashcard.back)}"`;

  return {
    question: `True or False: ${statement}?`,
    type: 'TRUE_FALSE',
    options: ['True', 'False'],
    correctAnswer: isCorrect ? 'True' : 'False',
    explanation: flashcard.example,
    points: 1,
    flashcardId: flashcard.id,
  };
}

private generateFillBlankQuestion(flashcard: Flashcard): Partial<CreateQuizQuestionDto> {
  const example = flashcard.example || `This is a ${flashcard.front} example.`;
  const blankedExample = example.replace(flashcard.front, '_____');

  return {
    question: `Fill in the blank: ${blankedExample}`,
    type: 'FILL_BLANK',
    options: [],
    correctAnswer: flashcard.front,
    explanation: `The correct word is "${flashcard.front}"`,
    points: 2,
    flashcardId: flashcard.id,
  };
}
```

### Phase 4: Controller Implementation

**QuizController** (`src/modules/education/quiz.controller.ts`)

**Endpoints:**

**Quiz Management:**
```typescript
POST   /quizzes                          // Create quiz
GET    /quizzes                          // Get user's quizzes
GET    /quizzes/public                   // Get public quizzes
GET    /quizzes/:id                      // Get quiz details
PATCH  /quizzes/:id                      // Update quiz
DELETE /quizzes/:id                      // Delete quiz
```

**Quiz Question Management:**
```typescript
POST   /quizzes/:id/questions            // Create question
POST   /quizzes/:id/questions/bulk       // Bulk create questions
GET    /quizzes/:id/questions            // Get quiz questions
PATCH  /quizzes/questions/:questionId    // Update question
DELETE /quizzes/questions/:questionId    // Delete question
```

**Generate Quiz from Flashcards:**
```typescript
POST   /quizzes/generate                 // Generate quiz from flashcards
```

**Quiz Session Management:**
```typescript
POST   /quizzes/:id/start                // Start quiz session
POST   /quizzes/sessions/:sessionId/answer // Submit answer
POST   /quizzes/sessions/:sessionId/complete // Complete session
GET    /quizzes/sessions/:sessionId      // Get session details
GET    /quizzes/:id/sessions             // Get quiz sessions
GET    /quizzes/sessions                 // Get all sessions
```

**Statistics:**
```typescript
GET    /quizzes/stats                    // Overall quiz stats
GET    /quizzes/stats/topic/:topic       // Topic-specific stats
GET    /quizzes/history                  // Quiz history
GET    /quizzes/sessions/:sessionId/wrong // Get wrong answers
GET    /quizzes/:id/leaderboard          // Get quiz leaderboard
```

### Phase 5: Module Integration

**Update EducationModule** (`src/modules/education/education.module.ts`)

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Existing entities...
      Quiz,
      QuizQuestion,
      QuizSession,
    ]),
  ],
  controllers: [
    // Existing controllers...
    QuizController,
  ],
  providers: [
    // Existing services...
    QuizService,
  ],
  exports: [
    // Existing exports...
    QuizService,
  ],
})
export class EducationModule {}
```

**Update App Module** (`src/app.module.ts`)
```typescript
// Add to entities array in TypeOrmModule.forRootAsync
Quiz,
QuizQuestion,
QuizSession,
```

### Phase 6: Database Migrations

**Migration 1: Create Quiz Tables**
```sql
CREATE TABLE edu_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  topic VARCHAR(100),
  question_type VARCHAR(20) DEFAULT 'MIXED',
  question_count INTEGER DEFAULT 10,
  time_limit INTEGER DEFAULT 60,
  passing_score INTEGER DEFAULT 0,
  difficulty VARCHAR(10) DEFAULT 'MIXED',
  is_public BOOLEAN DEFAULT true,
  shuffle_questions BOOLEAN DEFAULT true,
  shuffle_answers BOOLEAN DEFAULT true,
  show_correct_answer BOOLEAN DEFAULT false,
  allow_retry BOOLEAN DEFAULT false,
  max_retries INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_quizzes_user ON edu_quizzes(user_id);
CREATE INDEX idx_quizzes_topic ON edu_quizzes(topic);
CREATE INDEX idx_quizzes_type ON edu_quizzes(question_type);

CREATE TABLE edu_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  type VARCHAR(20) NOT NULL,
  options JSON,
  correct_answer VARCHAR(500) NOT NULL,
  explanation TEXT,
  points INTEGER DEFAULT 1,
  "order" INTEGER DEFAULT 0,
  flashcard_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  quiz_id UUID NOT NULL,
  FOREIGN KEY (quiz_id) REFERENCES edu_quizzes(id) ON DELETE CASCADE
);

CREATE INDEX idx_quiz_questions_quiz ON edu_quiz_questions(quiz_id);
CREATE INDEX idx_quiz_questions_type ON edu_quiz_questions(type);
CREATE INDEX idx_quiz_questions_flashcard ON edu_quiz_questions(flashcard_id);

CREATE TABLE edu_quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  score INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  earned_points INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  wrong_answers INTEGER DEFAULT 0,
  skipped_answers INTEGER DEFAULT 0,
  time_spent INTEGER DEFAULT 0,
  passed BOOLEAN DEFAULT false,
  completed BOOLEAN DEFAULT false,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  answers JSON,
  attempt_number INTEGER DEFAULT 0,
  user_id INTEGER NOT NULL,
  quiz_id UUID NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (quiz_id) REFERENCES edu_quizzes(id) ON DELETE CASCADE
);

CREATE INDEX idx_quiz_sessions_user_quiz ON edu_quiz_sessions(user_id, quiz_id);
CREATE INDEX idx_quiz_sessions_user_started ON edu_quiz_sessions(user_id, started_at);
```

### Phase 7: Key Implementation Details

**Random Question Generation:**
```typescript
private async getRandomFlashcards(
  userId: number,
  topic?: string,
  deckId?: string,
  count: number,
  difficulty?: string,
): Promise<Flashcard[]> {
  const where: any = { userId };

  if (topic) {
    where.deck = { topic };
  }

  if (deckId) {
    where.deckId = deckId;
  }

  if (difficulty && difficulty !== 'MIXED') {
    const difficultyMap = {
      'EASY': [1, 2],
      'MEDIUM': [3],
      'HARD': [4, 5],
    };
    where.difficulty = In(difficultyMap[difficulty]);
  }

  const flashcards = await this.flashcardRepository.find({
    where,
    take: count * 2, // Get extra for wrong answers
    order: { createdAt: 'DESC' },
  });

  return this.shuffleArray(flashcards).slice(0, count);
}

private shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
```

**Wrong Answer Generation:**
```typescript
private async getRandomWrongAnswers(correctAnswer: string, count: number): Promise<string[]> {
  const wrongAnswers = await this.flashcardRepository
    .createQueryBuilder('f')
    .select('f.back', 'answer')
    .where('f.back != :correctAnswer', { correctAnswer })
    .orderBy('RANDOM()')
    .limit(count)
    .getRawMany();

  return wrongAnswers.map(item => item.answer);
}

private async getRandomWrongAnswer(correctAnswer: string): Promise<string> {
  const wrongAnswers = await this.getRandomWrongAnswers(correctAnswer, 1);
  return wrongAnswers[0] || 'incorrect meaning';
}
```

**Session Management:**
```typescript
async startQuizSession(userId: number, dto: StartQuizSessionDto) {
  const quiz = await this.getQuizById(dto.quizId, userId);

  // Check retry limit
  if (!quiz.allowRetry) {
    const existingSessions = await this.quizSessionRepository.count({
      where: { userId, quizId: dto.quizId, completed: true },
    });
    if (existingSessions > 0) {
      throw new BadRequestException('Quiz does not allow retries');
    }
  }

  // Get questions
  let questions = await this.getQuizQuestions(dto.quizId, userId);

  // Shuffle if enabled
  if (quiz.shuffleQuestions) {
    questions = this.shuffleArray(questions);
  }

  // Limit question count
  if (dto.questionCount && dto.questionCount < questions.length) {
    questions = questions.slice(0, dto.questionCount);
  }

  // Shuffle answers if enabled
  if (quiz.shuffleAnswers) {
    questions = questions.map(q => ({
      ...q,
      options: this.shuffleArray(q.options),
    }));
  }

  const session = this.quizSessionRepository.create({
    quizId: dto.quizId,
    userId,
    totalPoints: questions.reduce((sum, q) => sum + q.points, 0),
    answers: [],
    attemptNumber: await this.getNextAttemptNumber(userId, dto.quizId),
  });

  return this.quizSessionRepository.save(session);
}
```

**Answer Submission & Scoring:**
```typescript
async submitQuizAnswer(userId: number, sessionId: string, dto: SubmitQuizAnswerDto) {
  const session = await this.getQuizSession(sessionId, userId);

  if (session.completed) {
    throw new BadRequestException('Quiz session already completed');
  }

  const question = await this.quizQuestionRepository.findOne({
    where: { id: dto.questionId },
  });

  if (!question) {
    throw new NotFoundException('Question not found');
  }

  const isCorrect = question.correctAnswer.toLowerCase() === dto.answer.toLowerCase();
  const points = isCorrect ? question.points : 0;

  // Update session
  const answers = session.answers || [];
  answers.push({
    questionId: dto.questionId,
    userAnswer: dto.answer,
    isCorrect,
    timeSpent: dto.timeSpent || 0,
    points,
  });

  session.answers = answers;
  session.earnedPoints = answers.reduce((sum, a) => sum + a.points, 0);
  session.correctAnswers = answers.filter(a => a.isCorrect).length;
  session.wrongAnswers = answers.filter(a => !a.isCorrect).length;

  await this.quizSessionRepository.save(session);

  return {
    isCorrect,
    points,
    correctAnswer: quiz.showCorrectAnswer ? question.correctAnswer : undefined,
    explanation: quiz.showCorrectAnswer ? question.explanation : undefined,
  };
}
```

### Phase 8: File Structure

```
src/modules/education/
├── entities/
│   ├── quiz.entity.ts
│   ├── quiz-question.entity.ts
│   └── quiz-session.entity.ts
├── dto/
│   ├── quiz.dto.ts
│   ├── quiz-question.dto.ts
│   └── quiz-session.dto.ts
├── quiz.controller.ts
├── quiz.service.ts
└── education.module.ts (updated)
```

### Phase 9: Testing Strategy

**Unit Tests:**
- QuizService methods (CRUD, generation, session management)
- Question generation logic
- Random selection algorithms
- Scoring calculations

**Integration Tests:**
- API endpoints for all operations
- Database relationships and constraints
- Quiz generation from flashcards
- Session flow and answer submission

**E2E Tests:**
- Complete user flow: generate quiz → start session → submit answers → complete → check results
- Random generation consistency
- Retry limit enforcement
- Leaderboard functionality

### Phase 10: API Documentation

**Swagger Documentation:**
- Add comprehensive API documentation for all endpoints
- Include request/response examples
- Document error responses
- Add pagination parameters

**Example API Calls:**
```bash
# Generate quiz from flashcards
POST /api/quizzes/generate
{
  "name": "HSK1 Vocabulary Quiz",
  "topic": "HSK1",
  "questionCount": 20,
  "questionType": "MULTIPLE_CHOICE",
  "difficulty": "EASY",
  "timeLimit": 300
}

# Start quiz session
POST /api/quizzes/quiz-id/start
{
  "questionCount": 10
}

# Submit answer
POST /api/quizzes/sessions/session-id/answer
{
  "questionId": "question-uuid",
  "answer": "correct answer",
  "timeSpent": 15
}

# Complete session
POST /api/quizzes/sessions/session-id/complete

# Get leaderboard
GET /api/quizzes/quiz-id/leaderboard?page=1&limit=10
```

## Critical Files to Modify

1. **src/modules/education/education.module.ts** - Add new entities and QuizService
2. **src/app.module.ts** - Add new entities to TypeORM configuration
3. **src/database/data-source.ts** - Add new entities to data source
4. **New files to create:**
   - All entity files in `src/modules/education/entities/`
   - All DTO files in `src/modules/education/dto/`
   - `src/modules/education/quiz.controller.ts`
   - `src/modules/education/quiz.service.ts`

## Verification Steps

1. **Database Setup:**
   - Run migration: `npm run migration:run`
   - Verify tables created: `edu_quizzes`, `edu_quiz_questions`, `edu_quiz_sessions`

2. **Build & Start:**
   - Build: `npm run build`
   - Start: `npm run start:dev`
   - Check for errors in console

3. **API Testing:**
   - Test quiz CRUD operations
   - Test quiz generation from flashcards
   - Test session flow (start → answer → complete)
   - Test statistics endpoints
   - Test leaderboard functionality

4. **Integration Testing:**
   - Generate quiz → Start session → Submit answers → Complete → Check results
   - Test random generation with different parameters
   - Test retry limit enforcement
   - Test topic-based filtering
   - Verify scoring accuracy

5. **Swagger Documentation:**
   - Access Swagger UI: `http://localhost:3000/api`
   - Verify all endpoints documented
   - Test endpoints through Swagger UI

## Implementation Order

1. **Phase 1:** Create entity files and database migration
2. **Phase 2:** Create DTO files with validation
3. **Phase 3:** Implement QuizService with core methods
4. **Phase 4:** Implement QuizController with all endpoints
5. **Phase 5:** Update module configuration
6. **Phase 6:** Test and verify functionality
7. **Phase 7:** Add comprehensive documentation

## Success Criteria

- ✅ Users can create and manage quizzes
- ✅ Users can generate quizzes from flashcards by topic
- ✅ Quiz supports multiple question types (multiple choice, true/false, fill blank)
- ✅ Random question generation works correctly
- ✅ Quiz sessions track answers and scoring
- ✅ Statistics and progress tracking are accurate
- ✅ Leaderboard functionality works
- ✅ All API endpoints are documented and tested
- ✅ Build succeeds without errors
- ✅ Database migrations run successfully

## Additional Features (Future Enhancements)

- **Adaptive Difficulty**: Adjust question difficulty based on user performance
- **Time Tracking**: Track time spent per question
- **Hint System**: Provide hints for difficult questions
- **Review Mode**: Focus on wrong answers
- **Achievements**: Unlock achievements based on quiz performance
- **Social Features**: Share quizzes with friends
- **Analytics**: Detailed performance analytics
- **Export/Import**: Export quiz results, import quiz templates
