# API Documentation for Frontend Developers

## 📋 Table of Contents

1. [Authentication](#authentication)
2. [Quiz System](#quiz-system)
   - [Quiz Management](#quiz-management)
   - [Question Management](#question-management)
   - [Quiz Sessions](#quiz-sessions)
   - [Quiz Statistics](#quiz-statistics)
3. [Flashcard System](#flashcard-system)
   - [Flashcard Deck Management](#flashcard-deck-management)
   - [Flashcard Management](#flashcard-management)
   - [Review System](#review-system)
4. [DTO References](#dto-reference)
5. [Frontend Integration Examples](#frontend-integration-examples)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)

---

## 🔐 Authentication

All API endpoints require JWT authentication except login/register endpoints.

### Authentication Flow

```typescript
// Step 1: Login
POST /auth/login
Request: { email: string, password: string }
Response: {
  accessToken: string,
  refreshToken: string,
  user: User
}

// Step 2: Include token in Authorization header for all subsequent requests
headers: {
  'Authorization': 'Bearer <access-token>'
}

// Step 3: Refresh token when it expires
POST /auth/refresh
Request: { refreshToken: string }
Response: { accessToken: string, refreshToken: string }
```

---

## 🎯 Quiz System

### Quiz Management

#### Create Quiz
```http
POST /quizzes
Authorization: Bearer <token>
Content-Type: application/json

Request Body: CreateQuizDto
{
  "name": "HSK Level 1",
  "description": "Quiz to test your HSK1 knowledge",
  "topic": "HSK1",
  "questionType": "MULTIPLE_CHOICE",
  "questionCount": 20,
  "timeLimit": 600, // in seconds
  "passingScore": 70, // percentage
  "difficulty": "EASY",
  "isPublic": false,
  "shuffleQuestions": true,
  "shuffleAnswers": true,
  "showCorrectAnswer": true,
  "allowRetry": true,
  "maxRetries": 3
}

Response: 201 Created
{
  "id": "uuid-quiz-id",
  "name": "HSK Level 1",
  "description": "Quiz to test your HSK1 knowledge",
  "topic": "HSK1",
  "questionType": "MULTIPLE_CHOICE",
  "questionCount": 20,
  "timeLimit": 600,
  "passingScore": 70,
  "difficulty": "EASY",
  "isPublic": false,
  "shuffleQuestions": true,
  "shuffleAnswers": true,
  "showCorrectAnswer": true,
  "allowRetry": true,
  "maxRetries": 3,
  "userId": 123,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### Get User Quizzes
```http
GET /quizzes?topic=HSK1&page=1&limit=20
Authorization: Bearer <token>

Response: 200 OK
{
  "data": [Quiz[],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### Get Public Quizzes
```http
GET /quizzes/public?page=1&limit=20

Response: 200 OK
{
  "data": [Quiz[],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### Get Quiz by ID
```http
GET /quizzes/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "uuid-quiz-id",
  "name": "HSK Level 1",
  "description": "Quiz to test your HSK1 knowledge",
  "topic": "HSK1",
  "userId": 123,
  "questions": [
    {
      "id": "uuid-question-id",
      "question": "How do you say 'hello'?",
      "type": "MULTIPLE_CHOICE",
      "options": ["大家好", "再见", "你好", "不谢"],
      "correctAnswer": "你好",
      "explanation": "你好 is the most common greeting"
    }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

#### Update Quiz
```http
PATCH /quizzes/:id
Authorization: Bearer <token>
Content-Type: application/json

Request Body: UpdateQuizDto
{
  "name": "Updated Quiz Name",
  "topic": "HSK2",
  "difficulty": "MEDIUM"
}

Response: 200 OK
{ Quiz }
```

#### Delete Quiz
```http
DELETE /quizzes/:id
Authorization: Bearer <token>

Response: 200 OK
{ "message": "Quiz deleted successfully" }
```

---

### Question Management

#### Create Single Question
```http
POST /quizzes/:id/questions
Authorization: Bearer <token>
Content-Type: application/json

Request Body: CreateQuizQuestionDto
{
  "question": "How do you say 'hello' in Chinese?",
  "type": "MULTIPLE_CHOICE",
  "options": ["大家好", "再见", "你好", "不谢"],
  "correctAnswer": "你好",
  "explanation": "你好 is the most common greeting",
  "points": 1,
  "flashcardId": "uuid-optional-flashcard"
}

Response: 201 Created
{
  "id": "uuid-question-id",
  "question": "How do you say 'hello' in Chinese?",
  "type": "MULTIPLE_CHOICE",
  "options": ["大家好", "再见", "你好", "不谢"],
  "correctAnswer": "你好",
  "explanation": "你好 is the most common greeting",
  "points": 1,
  "quizId": "uuid-quiz-id",
  "flashcardId": "uuid-optional-flashcard",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### Bulk Create Questions
```http
POST /quizzes/:id/questions/bulk
Authorization: Bearer <token>
Content-Type: application/json

Request Body: BulkCreateQuizQuestionDto
{
  "questions": [
    {
      "question": "Question 1",
      "type": "MULTIPLE_CHOICE",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "A"
    },
    {
      "question": "Question 2",
      "type": "TRUE_FALSE",
      "correctAnswer": "TRUE"
    }
  ]
}

Response: 201 Created
[
  { Question }, // question 1
  { Question }  // question 2
]
```

#### Update Question
```http
PATCH /quizzes/questions/:questionId
Authorization: Bearer <token>
Content-Type: application/json

Request Body: UpdateQuizQuestionDto
{
  "question": "Updated question text",
  "correctAnswer": "Updated answer",
  "explanation": "Updated explanation"
}

Response: 200 OK
{ Question }
```

#### Delete Question
```http
DELETE /quizzes/questions/:questionId
Authorization: Bearer <token>

Response: 200 OK
{ "message": "Question deleted successfully" }
```

---

### Quiz Sessions

#### Start Quiz Session
```http
POST /quizzes/:id/start
Authorization: Bearer <token>
Content-Type: application/json

Request Body: StartQuizSessionDto
{
  "quizId": "uuid-quiz-id",
  "questionCount": 10 // optional, defaults to quiz settings
}

Response: 201 Created
{
  "id": "uuid-session-id",
  "quizId": "uuid-quiz-id",
  "userId": 123,
  "status": "IN_PROGRESS",
  "currentQuestionIndex": 0,
  "correctAnswers": 0,
  "totalAnswers": 0,
  "score": 0,
  "startTime": "2024-01-01T00:00:00.000Z",
  "endTime": null,
  "timeSpent": 0,
  "expiresAt": "2024-01-01T01:00:00.000Z" // +1 hour
}
```

#### Submit Answer
```http
POST /quiz/sessions/:sessionId/answer
Authorization: Bearer <token>
Content-Type: application/json

Request Body: SubmitQuizAnswerDto
{
  "questionId": "uuid-question-id",
  "answer": "你好",
  "timeSpent": 15 // seconds spent on this question
}

Response: 200 OK
{
  "isCorrect": true,
  "correctAnswer": "你好",
  "explanation": "你好 is correct!",
  "points": 1
}
```

#### Complete Quiz Session
```http
POST /quiz/sessions/:sessionId/complete
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "uuid-session-id",
  "quizId": "uuid-quiz-id",
  "status": "COMPLETED",
  "currentQuestionIndex": 10,
  "correctAnswers": 8,
  "totalAnswers": 10,
  "score": 80,
  "startTime": "2024-01-01T00:00:00.000Z",
  "endTime": "2024-01-01T00:15:00.000Z",
  "timeSpent": 900,
  "passed": true,
  "certificateUrl": "https://.../certificates/uuid.pdf"
}
```

#### Get Quiz Sessions

Get sessions for a specific quiz:
```http
GET /quizzes/:id/sessions?page=1&limit=20
Authorization: Bearer <token>

Response: 200 OK
{
  "data": [QuizSession[],
  "meta": { pagination }
}
```

Get all sessions for the user:
```http
GET /quiz/sessions?page=1&limit=20
Authorization: Bearer <token>

Response: 200 OK
{
  "data": [QuizSession[],
  "meta": { pagination }
}
```

#### Get Single Session
```http
GET /quiz/sessions/:sessionId
Authorization: Bearer <token>

Response: 200 OK
{ QuizSession }
```

---

### Quiz Statistics

#### Get Overall Statistics
```http
GET /quizzes/stats
Authorization: Bearer <token>

Response: 200 OK
{
  "totalQuizzes": 10,
  "totalAttempts": 25,
  "averageScore": 78.5,
  "highestScore": 100,
  "lowestScore": 60,
  "averageTimePerQuestion": 45.2,
  "watchedTopics": ["HSK1", "HSK2"],
  "completedQuizzes": 8,
  "passedQuizzes": 7
}
```

#### Get Topic Statistics
```http
GET /quizzes/stats/topic/:topic
Authorization: Bearer <token>

Response: 200 OK
{
  "topic": "HSK1",
  "totalAttempts": 15,
  "averageScore": 82.3,
  "highestScore": 100,
  "lowestScore": 70,
  "favoriteQuestionTypes": ["MULTIPLE_CHOICE"],
  "strengths": ["pinyin", "basic vocabulary"],
  "weaknesses": ["complex characters", "grammar"]
}
```

#### Get Quiz History
```http
GET /quizzes/history?page=1&limit=20
Authorization: Bearer <token>

Response: 200 OK
{
  "data": [
    {
      "id": "uuid-session-id",
      "quizId": "uuid-quiz-id",
      "quizName": "HSK Level 1",
      "topic": "HSK1",
      "status": "COMPLETED",
      "score": 80,
      "correctAnswers": 8,
      "totalAnswers": 10,
      "timeSpent": 900,
      "startTime": "2024-01-01T00:00:00.000Z",
      "endTime": "2024-01-01T00:15:00.000Z",
      "passed": true
    }
  ],
  "meta": { pagination }
}
```

#### Get Wrong Answers

Get wrong answers for a specific session:
```http
GET /quizzes/sessions/:sessionId/wrong
Authorization: Bearer <token>

Response: 200 OK
{
  "sessionId": "uuid-session-id",
  "wrongAnswers": [
    {
      "questionId": "uuid-question-id",
      "question": "How do you say 'thank you'?",
      "userAnswer": "不客氣",
      "correctAnswer": "谢谢",
      "explanation": "谢谢 is the most common way to say thank you",
      "type": "MULTIPLE_CHOICE",
      "options": ["不客氣", "对不起", "谢谢", "你好吗"],
      "timeSpent": 10
    }
  ]
}
```

Get all wrong answers:
```http
GET /quizzes/wrong-answers
Authorization: Bearer <token>

Response: 200 OK
[wrongAnswers] // all wrong answers across all sessions
```

#### Generate Quiz from Flashcards
```http
POST /quizzes/generate
Authorization: Bearer <token>
Content-Type: application/json

Request Body: GenerateQuizFromFlashcardsDto
{
  "name": "HSK1 Vocabulary Quiz",
  "topic": "HSK1",
  "deckId": "uuid-deck-id", // optional
  "questionCount": 20,
  "questionType": "MULTIPLE_CHOICE",
  "difficulty": "EASY",
  "timeLimit": 600
}

Response: 201 Created
{ Quiz } // with generated questions from flashcards
```

---

### Quiz Leaderboard

#### Get Quiz Leaderboard
```http
GET /quizzes/:id/leaderboard?page=1&limit=10

Response: 200 OK
{
  "data": [
    {
      "rank": 1,
      "userId": 123,
      "userName": "Alice",
      "score": 100,
      "timeSpent": 450,
      "accuracy": 100,
      "completedAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "meta": { pagination }
}
```

---

## 🗂️ Flashcard System

### Flashcard Deck Management

#### Create Flashcard Deck
```http
POST /flashcard/decks
Authorization: Bearer <token>
Content-Type: application/json

Request Body: CreateFlashcardDeckDto
{
  "name": "HSK1 Vocabulary",
  "description": "Essential HSK1 vocabulary flashcards",
  "icon": "book",
  "color": "#3498db",
  "topic": "HSK1",
  "isPublic": false
}

Response: 201 Created
{
  "id": "uuid-deck-id",
  "name": "HSK1 Vocabulary",
  "description": "Essential HSK1 vocabulary flashcards",
  "icon": "book",
  "color": "#3498db",
  "cardCount": 0,
  "type": "USER",
  "topic": "HSK1",
  "isPublic": false,
  "userId": 123,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### Get User Decks
```http
GET /flashcard/decks?topic=HSK1&page=1&limit=20
Authorization: Bearer <token>

Response: 200 OK
{
  "data": [FlashcardDeck[],
  "meta": { pagination }
}
```

#### Get Deck by ID
```http
GET /flashcard/decks/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "uuid-deck-id",
  "name": "HSK1 Vocabulary",
  "description": "Essential HSK1 vocabulary flashcards",
  "cardCount": 150,
  "topic": "HSK1",
  "cards": [ // optional with flashcards
    {
      "id": "uuid-card-id",
      "front": "你好",
      "back": "hello",
      "pronunciation": "nǐ hǎo",
      "example": "你好！你今天好吗？",
      "exampleTranslation": "Hello! How are you today?",
      "status": "NEW"
    }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

#### Update Deck
```http
PATCH /flashcard/decks/:id
Authorization: Bearer <token>
Content-Type: application/json

Request Body: UpdateFlashcardDeckDto
{
  "name": "Updated Deck Name",
  "color": "#e74c3c"
}

Response: 200 OK
{ FlashcardDeck }
```

#### Delete Deck
```http
DELETE /flashcard/decks/:id
Authorization: Bearer <token>

Response: 200 OK
{ "message": "Deck deleted successfully" }
```

---

### Flashcard Management

#### Create Single Flashcard
```http
POST /flashcard/cards
Authorization: Bearer <token>
Content-Type: application/json

Request Body: CreateFlashcardDto
{
  "front": "你好",
  "back": "hello",
  "pronunciation": "nǐ hǎo",
  "example": "你好！你今天好吗？",
  "exampleTranslation": "Hello! How are you today?",
  "audioUrl": "https://.../audio/nǐhǎo.mp3",
  "imageUrl": "https://.../images/hello.jpg",
  "notes": "A common greeting",
  "difficulty": 1,
  "deckId": "uuid-deck-id",
  "tags": ["greeting", "basic"]
}

Response: 201 Created
{
  "id": "uuid-card-id",
  "front": "你好",
  "back": "hello",
  "pronunciation": "nǐ hǎo",
  "example": "你好！你今天好吗？",
  "exampleTranslation": "Hello! How are you today?",
  "audioUrl": "https://.../audio/nǐhǎo.mp3",
  "imageUrl": "https://.../images/hello.jpg",
  "notes": "A common greeting",
  "difficulty": 1,
  "status": "NEW",
  "viewCount": 0,
  "deckId": "uuid-deck-id",
  "userId": 123,
  "tags": ["greeting", "basic"],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### Bulk Create Flashcards
```http
POST /flashcard/cards/bulk
Authorization: Bearer <token>
Content-Type: application/json

Request Body: BulkCreateFlashcardDto
{
  "flashcards": [
    {
      "front": "你好",
      "back": "hello",
      "pronunciation": "nǐ hǎo"
    },
    {
      "front": "谢谢",
      "back": "thank you",
      "pronunciation": "xiè xie"
    }
  ],
  "deckId": "uuid-deck-id"
}

Response: 201 Created
[
  { Flashcard }, // card 1
  { Flashcard }  // card 2
]
```

#### Get Deck Cards
```http
GET /flashcard/decks/:id/cards?page=1&limit=50
Authorization: Bearer <token>

Response: 200 OK
{
  "data": [
    {
      "id": "uuid-card-id",
      "front": "你好",
      "back": "hello",
      "status": "NEW",
      "viewCount": 5,
      "difficulty": 1
    }
  ],
  "meta": { pagination }
}
```

#### Get User Cards
```http
GET /flashcard/cards?page=1&limit=50&deckId=uuid-deck-id&status=REVIEWING
Authorization: Bearer <token>

Response: 200 OK
{
  "data": [Flashcard[],
  "meta": { pagination }
}
```

#### Update Flashcard
```http
PATCH /flashcard/cards/:id
Authorization: Bearer <token>
Content-Type: application/json

Request Body: UpdateFlashcardDto
{
  "front": "你好 (updated)",
  "back": "hello (updated)",
  "difficulty": 2,
  "tags": ["greeting", "basic", "common"]
}

Response: 200 OK
{ Flashcard }
```

#### Delete Flashcard
```http
DELETE /flashcard/cards/:id
Authorization: Bearer <token>

Response: 200 OK
{ "message": "Flashcard deleted successfully" }
```

---

### Review System

#### Start Review Session
```http
POST /flashcard/review/start
Authorization: Bearer <token>
Content-Type: application/json

Request Body: StartReviewSessionDto
{
  "deckId": "uuid-deck-id", // optional - review specific deck
  "limit": 20, // optional - max cards to review
  "type": "DAILY" // "DAILY" (due cards only), "DECK" (all cards), "CUSTOM"
}

Response: 201 Created
{
  "id": "uuid-review-session-id",
  "userId": 123,
  "cards": [ // cards due for review
    {
      "id": "uuid-card-id",
      "front": "你好",
      "back": "hello",
      "status": "REVIEWING",
      "interval": 1, // days until next review
      "repetitions": 3, // times reviewed
      "easeFactor": 2.5
    }
  ],
  "totalCards": 20,
  "currentIndex": 0,
  "completedCards": 0
}
```

#### Review Flashcard (Submit Quality)
```http
POST /flashcard/review/submit
Authorization: Bearer <token>
Content-Type: application/json

Request Body: ReviewFlashcardDto
{
  "flashcardId": "uuid-card-id",
  "quality": 4 // 0-5 (0=wrong, 3=correct, 5=easy)
}

Response: 200 OK
{
  "id": "uuid-card-id",
  "front": "你好",
  "back": "hello",
  "status": "REVIEWING", // or "LEARNING", "MASTERED"
  "interval": 3, // updated based on SRS algorithm
  "repetitions": 4,
  "easeFactor": 2.6,
  "nextReview": "2024-01-04T00:00:00.000Z",
  "lastReviewed": "2024-01-01T00:00:00.000Z"
}
```

**Quality Scale for Reviews:**
- `0`: Complete blackout (wrong, start over)
- `1`: Incorrect response, but remembered after seeing answer
- `2`: Correct response, but required significant effort
- `3`: Correct response, moderate difficulty
- `4`: Correct response, easy (default for correct answers)
- `5`: Perfect response, too easy (will increase interval faster)

#### Complete Review Session
```http
POST /flashcard/review/complete
Authorization: Bearer <token>
Content-Type: application/json

Request Body: CompleteReviewSessionDto
{
  "sessionId": "uuid-review-session-id"
}

Response: 200 OK
{
  "sessionId": "uuid-review-session-id",
  "status": "COMPLETED",
  "cardsReviewed": 20,
  "newCards": 5,
  "learnedCards": 3,
  "masteredCards": 2,
  "totalStudyTime": 450, // seconds
  "accuracy": 85 // percentage
}
```

#### Get Cards By Status
```http
GET /flashcard/cards/status/:status?page=1&limit=50&deckId=uuid-deck-id
Authorization: Bearer <token>

// status can be: NEW, LEARNING, REVIEWING, MASTERED

Response: 200 OK
{
  "data": [Flashcard[],
  "meta": { pagination }
}
```

#### Get Card Statistics
```http
GET /flashcard/stats
Authorization: Bearer <token>

Response: 200 OK
{
  "totalCards": 150,
  "newCards": 45,
  "learningCards": 20,
  "reviewingCards": 60,
  "masteredCards": 25,
  "totalDecks": 5,
  "cardsDueToday": 15,
  "todayStudied": 10,
  "streak": 7, // consecutive days
  "totalStudyTime": 7200, // seconds
  "averageTimePerCard": 48, // seconds
  "accuracy": 82.5
}
```

#### Get Deck Statistics
```http
GET /flashcard/decks/:id/stats
Authorization: Bearer <token>

Response: 200 OK
{
  "deckId": "uuid-deck-id",
  "totalCards": 150,
  "newCards": 45,
  "learningCards": 20,
  "reviewingCards": 60,
  "masteredCards": 25,
  "cardsDueToday": 15,
  "lastStudied": "2024-01-01T12:00:00.000Z",
  "averageRecallRate": 78.5
}
```

---

### Import From Vocabulary

#### Import Single Card
```http
POST /flashcard/import/vocabulary
Authorization: Bearer <token>
Content-Type: application/json

Request Body: ImportFromVocabularyDto
{
  "vocabularyId": "uuid-vocab-id",
  "deckId": "uuid-deck-id", // optional - will create new deck if not provided
  "autoPronunciation": true, // auto-generate pronunciation
  "autoAudio": true // auto-generate audio URL
}

Response: 201 Created
{
  "message": "Flashcard created successfully",
  "flashcard": { Flashcard }
}
```

#### Bulk Import from Vocabulary
```http
POST /flashcard/import/vocabulary/bulk
Authorization: Bearer <token>
Content-Type: application/json

Request Body: ImportFromVocabularyBulkDto
{
  "vocabularyIds": ["uuid-vocab-id-1", "uuid-vocab-id-2"],
  "deckId": "uuid-deck-id", // optional
  "autoPronunciation": true,
  "autoAudio": true
}

Response: 201 Created
{
  "message": "Imported 2 flashcards successfully",
  "flashcards": [Flashcard[]
}
```

---

## 📚 DTO Reference

### Flashcard DTOs

#### CreateFlashcardDto
```typescript
interface CreateFlashcardDto {
  front: string;           // Required, max 500 chars
  back: string;            // Required
  pronunciation?: string; // Optional, max 255 chars
  example?: string;        // Optional
  exampleTranslation?: string; // Optional
  audioUrl?: string;       // Optional, valid URL
  imageUrl?: string;       // Optional, valid URL
  notes?: string;          // Optional
  difficulty?: number;      // Optional, range 1-5
  deckId?: string;         // Optional, will create in root if not provided
  tags?: string[];         // Optional, array of strings
}
```

#### UpdateFlashcardDto
```typescript
interface UpdateFlashcardDto {
  front?: string;
  back?: string;
  pronunciation?: string;
  example?: string;
  exampleTranslation?: string;
  audioUrl?: string;
  imageUrl?: string;
  notes?: string;
  difficulty?: number;     // Range 1-5
  tags?: string[];
}
```

#### CreateFlashcardDeckDto
```typescript
interface CreateFlashcardDeckDto {
  name: string;           // Required, max 255 chars
  description?: string;     // Optional, max 1000 chars
  icon?: string;           // Optional, max 255 chars
  color?: string;        // Optional, hex color (#000000)
  topic?: string;        // Optional, e.g., "HSK1", "HSK2", etc.
  isPublic?: boolean;    // Optional, default false
}
```

### Quiz DTOs

#### CreateQuizDto
```typescript
interface CreateQuizDto {
  name: string;                   // Required, max 255 chars
  description?: string;          // Optional, max 1000 chars
  topic?: string;                // Optional, e.g., "HSK1", "HSK2", etc.
  questionType?: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK' | 'MIXED'; // Optional
  questionCount?: number;        // Optional, range 1-100
  timeLimit?: number;            // Optional, range 30-3600 seconds
  passingScore?: number;         // Optional, range 0-100
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED'; // Optional
  isPublic?: boolean;            // Optional
  shuffleQuestions?: boolean;   // Optional, default true
  shuffleAnswers?: boolean;     // Optional, default true
  showCorrectAnswer?: boolean;  // Optional
  allowRetry?: boolean;         // Optional
  maxRetries?: number;          // Optional, range 0-10
}
```

#### CreateQuizQuestionDto
```typescript
interface CreateQuizQuestionDto {
  question: string;              // Required
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK'; // Required
  options?: string[];           // Required for MULTIPLE_CHOICE
  correctAnswer: string;        // Required
  explanation?: string;         // Optional
  points?: number;              // Optional, default 1, range 1-10
  flashcardId?: string;        // Optional, link to flashcard
}
```

#### StartQuizSessionDto
```typescript
interface StartQuizSessionDto {
  quizId: string;              // Required
  questionCount?: number;      // Optional, defaults to quiz setting
}
```

#### SubmitQuizAnswerDto
```typescript
interface SubmitQuizAnswerDto {
  questionId: string;          // Required
  answer: string;              // Required
  timeSpent?: number;          // Optional, seconds
}
```

---

## 💻 Frontend Integration Examples

### React + Axios Integration

#### 1. Setup Axios Instance
```typescript
// api/client.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for authentication
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If token expired, refresh it
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const response = await axios.post('http://localhost:3000/auth/refresh', {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', newRefreshToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return axios(originalRequest);
      } catch (refreshError) {
        // Redirect to login if refresh fails
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

#### 2. Quiz Service
```typescript
// services/quizService.ts
import apiClient from '../api/client';

export interface Quiz {
  id: string;
  name: string;
  description: string;
  topic: string;
  questionType: string;
  questionCount: number;
  timeLimit: number;
  passingScore: number;
  difficulty: string;
  isPublic: boolean;
  questions?: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
  points: number;
}

export interface QuizSession {
  id: string;
  quizId: string;
  status: string;
  currentQuestionIndex: number;
  correctAnswers: number;
  totalAnswers: number;
  score: number;
  startTime: string;
}

export const quizService = {
  // Create quiz
  createQuiz: async (quizData: Partial<Quiz>) => {
    const response = await apiClient.post('/quizzes', quizData);
    return response.data;
  },

  // Get user quizzes
  getUserQuizzes: async (params?: { topic?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get('/quizzes', { params });
    return response.data;
  },

  // Get public quizzes
  getPublicQuizzes: async (params?: { page?: number; limit?: number }) => {
    const response = await apiClient.get('/quizzes/public', { params });
    return response.data;
  },

  // Get quiz by id
  getQuizById: async (id: string) => {
    const response = await apiClient.get(`/quizzes/${id}`);
    return response.data;
  },

  // Update quiz
  updateQuiz: async (id: string, quizData: Partial<Quiz>) => {
    const response = await apiClient.patch(`/quizzes/${id}`, quizData);
    return response.data;
  },

  // Delete quiz
  deleteQuiz: async (id: string) => {
    const response = await apiClient.delete(`/quizzes/${id}`);
    return response.data;
  },

  // Create question
  createQuestion: async (quizId: string, questionData: Partial<QuizQuestion>) => {
    const response = await apiClient.post(`/quizzes/${quizId}/questions`, questionData);
    return response.data;
  },

  // Bulk create questions
  bulkCreateQuestions: async (quizId: string, questions: Partial<QuizQuestion>[]) => {
    const response = await apiClient.post(`/quizzes/${quizId}/questions/bulk`, {
      questions,
    });
    return response.data;
  },

  // Get questions
  getQuestions: async (quizId: string) => {
    const response = await apiClient.get(`/quizzes/${quizId}/questions`);
    return response.data;
  },

  // Start quiz session
  startQuizSession: async (quizId: string, questionCount?: number) => {
    const response = await apiClient.post(`/quizzes/${quizId}/start`, {
      questionCount,
    });
    return response.data;
  },

  // Submit answer
  submitAnswer: async (sessionId: string, answerData: {
    questionId: string;
    answer: string;
    timeSpent?: number;
  }) => {
    const response = await apiClient.post(`/quiz/sessions/${sessionId}/answer`, answerData);
    return response.data;
  },

  // Complete session
  completeQuizSession: async (sessionId: string) => {
    const response = await apiClient.post(`/quiz/sessions/${sessionId}/complete`);
    return response.data;
  },

  // Get quiz sessions
  getQuizSessions: async (quizId?: string, params?: { page?: number; limit?: number }) => {
    const url = quizId ? `/quizzes/${quizId}/sessions` : '/quiz/sessions';
    const response = await apiClient.get(url, { params });
    return response.data;
  },

  // Get quiz stats
  getQuizStats: async () => {
    const response = await apiClient.get('/quizzes/stats');
    return response.data;
  },

  // Get topic stats
  getTopicStats: async (topic: string) => {
    const response = await apiClient.get(`/quizzes/stats/topic/${topic}`);
    return response.data;
  },

  // Get quiz history
  getQuizHistory: async (params?: { page?: number; limit?: number }) => {
    const response = await apiClient.get('/quizzes/history', { params });
    return response.data;
  },

  // Generate quiz from flashcards
  generateQuizFromFlashcards: async (data: {
    name: string;
    topic?: string;
    deckId?: string;
    questionCount?: number;
    questionType?: string;
    difficulty?: string;
    timeLimit?: number;
  }) => {
    const response = await apiClient.post('/quizzes/generate', data);
    return response.data;
  },
};
```

#### 3. Flashcard Service
```typescript
// services/flashcardService.ts
import apiClient from '../api/client';

export interface FlashcardDeck {
  id: string;
  name: string;
  description: string;
  icon?: string;
  color?: string;
  cardCount: number;
  topic?: string;
  isPublic: boolean;
  type: 'USER' | 'SYSTEM';
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  pronunciation?: string;
  example?: string;
  exampleTranslation?: string;
  status: 'NEW' | 'LEARNING' | 'REVIEWING' | 'MASTERED';
  difficulty: number;
  viewCount: number;
  deckId: string;
  tags?: string[];
}

export interface ReviewSession {
  id: string;
  cards: Flashcard[];
  totalCards: number;
  currentIndex: number;
}

export const flashcardService = {
  // Create deck
  createDeck: async (deckData: Partial<FlashcardDeck>) => {
    const response = await apiClient.post('/flashcard/decks', deckData);
    return response.data;
  },

  // Get user decks
  getUserDecks: async (params?: { topic?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get('/flashcard/decks', { params });
    return response.data;
  },

  // Get deck by id
  getDeck: async (id: string, includeCards = false) => {
    const response = await apiClient.get(`/flashcard/decks/${id}`, {
      params: { includeCards },
    });
    return response.data;
  },

  // Update deck
  updateDeck: async (id: string, deckData: Partial<FlashcardDeck>) => {
    const response = await apiClient.patch(`/flashcard/decks/${id}`, deckData);
    return response.data;
  },

  // Delete deck
  deleteDeck: async (id: string) => {
    const response = await apiClient.delete(`/flashcard/decks/${id}`);
    return response.data;
  },

  // Create flashcard
  createFlashcard: async (cardData: Partial<Flashcard>) => {
    const response = await apiClient.post('/flashcard/cards', cardData);
    return response.data;
  },

  // Bulk create flashcards
  bulkCreateFlashcards: async (
    flashcards: Partial<Flashcard>[],
    deckId?: string
  ) => {
    const response = await apiClient.post('/flashcard/cards/bulk', {
      flashcards,
      deckId,
    });
    return response.data;
  },

  // Get cards
  getCards: async (params?: { deckId?: string; status?: string; page?: number; limit?: number }) => {
    const response = await apiClient.get('/flashcard/cards', { params });
    return response.data;
  },

  // Get deck cards
  getDeckCards: async (deckId: string, params?: { page?: number; limit?: number }) => {
    const response = await apiClient.get(`/flashcard/decks/${deckId}/cards`, { params });
    return response.data;
  },

  // Update flashcard
  updateFlashcard: async (id: string, cardData: Partial<Flashcard>) => {
    const response = await apiClient.patch(`/flashcard/cards/${id}`, cardData);
    return response.data;
  },

  // Delete flashcard
  deleteFlashcard: async (id: string) => {
    const response = await apiClient.delete(`/flashcard/cards/${id}`);
    return response.data;
  },

  // Start review session
  startReviewSession: async (data?: {
    deckId?: string;
    limit?: number;
    type?: 'DAILY' | 'DECK' | 'CUSTOM';
  }) => {
    const response = await apiClient.post('/flashcard/review/start', data);
    return response.data;
  },

  // Submit review (quality rating)
  submitReview: async (data: {
    flashcardId: string;
    quality: number; // 0-5
  }) => {
    const response = await apiClient.post('/flashcard/review/submit', data);
    return response.data;
  },

  // Complete review session
  completeReviewSession: async (sessionId: string) => {
    const response = await apiClient.post('/flashcard/review/complete', {
      sessionId,
    });
    return response.data;
  },

  // Get cards by status
  getCardsByStatus: async (
    status: 'NEW' | 'LEARNING' | 'REVIEWING' | 'MASTERED',
    params?: { deckId?: string; page?: number; limit?: number }
  ) => {
    const response = await apiClient.get(`/flashcard/cards/status/${status}`, {
      params,
    });
    return response.data;
  },

  // Get flashcard stats
  getFlashcardStats: async () => {
    const response = await apiClient.get('/flashcard/stats');
    return response.data;
  },

  // Import from vocabulary
  importFromVocabulary: async (data: {
    vocabularyId: string;
    deckId?: string;
  }) => {
    const response = await apiClient.post('/flashcard/import/vocabulary', data);
    return response.data;
  },

  // Bulk import from vocabulary
  bulkImportFromVocabulary: async (data: {
    vocabularyIds: string[];
    deckId?: string;
  }) => {
    const response = await apiClient.post('/flashcard/import/vocabulary/bulk', data);
    return response.data;
  },
};
```

#### 4. React Query Hooks (TanStack Query v5)
```typescript
// hooks/useQuiz.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quizService } from '../services/quizService';
import type { Quiz, QuizQuestion, QuizSession } from '../services/quizService';

export const useGetUserQuizzes = (params?: { topic?: string; page?: number; limit?: number }) => {
  return useQuery({
    queryKey: ['quizzes', 'user', params],
    queryFn: () => quizService.getUserQuizzes(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useGetQuizById = (id: string) => {
  return useQuery({
    queryKey: ['quizzes', id],
    queryFn: () => quizService.getQuizById(id),
    staleTime: 1000 * 60 * 5,
    enabled: !!id,
  });
};

export const useCreateQuiz = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: quizService.createQuiz,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });
    },
  });
};

export const useStartQuizSession = () => {
  return useMutation({
    mutationFn: ({ quizId, questionCount }: { quizId: string; questionCount?: number }) =>
      quizService.startQuizSession(quizId, questionCount),
  });
};

export const useSubmitAnswer = () => {
  return useMutation({
    mutationFn: ({
      sessionId,
      answerData,
    }: {
      sessionId: string;
      answerData: { questionId: string; answer: string; timeSpent?: number };
    }) => quizService.submitAnswer(sessionId, answerData),
  });
};

export const useCompleteQuizSession = () => {
  return useMutation({
    mutationFn: (sessionId: string) => quizService.completeQuizSession(sessionId),
  });
};

// hooks/useFlashcards.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { flashcardService } from '../services/flashcardService';
import type { FlashcardDeck, Flashcard } from '../services/flashcardService';

export const useGetUserDecks = (params?: { topic?: string; page?: number; limit?: number }) => {
  return useQuery({
    queryKey: ['flashcard-decks', 'user', params],
    queryFn: () => flashcardService.getUserDecks(params),
    staleTime: 1000 * 60 * 5,
  });
};

export const useGetDeck = (id: string) => {
  return useQuery({
    queryKey: ['flashcard-decks', id],
    queryFn: () => flashcardService.getDeck(id),
    staleTime: 1000 * 60 * 5,
    enabled: !!id,
  });
};

export const useDeckCards = (deckId: string, params?: { page?: number; limit?: number }) => {
  return useQuery({
    queryKey: ['flashcard-cards', 'deck', deckId, params],
    queryFn: () => flashcardService.getDeckCards(deckId, params),
    staleTime: 1000 * 60 * 5,
    enabled: !!deckId,
  });
};

export const useStartReviewSession = () => {
  return useMutation({
    mutationFn: (data?: { deckId?: string; limit?: number; type?: 'DAILY' | 'DECK' | 'CUSTOM' }) =>
      flashcardService.startReviewSession(data),
  });
};

export const useSubmitReview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { flashcardId: string; quality: number }) =>
      flashcardService.submitReview(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flashcard-cards'] });
      queryClient.invalidateQueries({ queryKey: ['flashcard-stats'] });
    },
  });
};

// Component Example
import React from 'react';
import { useGetQuizById, useStartQuizSession, useSubmitAnswer } from '../hooks/useQuiz';

const QuizComponent: React.FC<{ quizId: string }> = ({ quizId }) => {
  const { data: quiz, isLoading } = useGetQuizById(quizId);
  const { mutate: startSession, data: session } = useStartQuizSession();
  const { mutate: submitAnswer } = useSubmitAnswer();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{quiz.name}</h1>
      <button onClick={() => startSession({ quizId })}>Start Quiz</button>
      {session && (
        <div>
          <p>Session started: {session.id}</p>
          <button onClick={() => submitAnswer({
            sessionId: session.id,
            answerData: {
              questionId: 'uuid',
              answer: '你好'
            }
          })}>
            Submit Answer
          </button>
        </div>
      )}
    </div>
  );
};
```

---

## ❌ Error Handling

### Error Response Format
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "path": "/quizzes"
}
```

### Common Error Codes

| Status | Error Type | Description |
|--------|-----------|-------------|
| 400 | Validation Error | Invalid input data |
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource |
| 429 | Rate Limit | Too many requests |
| 500 | Server Error | Internal server error |

### Frontend Error Handling Example
```typescript
// services/apiErrorHandler.ts
import type { AxiosError } from 'axios';

interface ApiError {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
}

export const handleApiError = (error: AxiosError<ApiError>) => {
  const response = error.response;

  if (!response) {
    // Network error
    console.error('Network error:', error.message);
    return {
      type: 'NETWORK_ERROR',
      message: 'Unable to connect to server. Please check your connection.',
    };
  }

  const { status, data } = response;

  switch (status) {
    case 400:
      // Validation error
      return {
        type: 'VALIDATION_ERROR',
        message: data?.message || 'Invalid input data',
        details: data,
      };

    case 401:
      // Unauthorized - redirect to login
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
      return {
        type: 'UNAUTHORIZED',
        message: 'Session expired. Please login again.',
      };

    case 403:
      // Forbidden
      return {
        type: 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      };

    case 404:
      // Not found
      return {
        type: 'NOT_FOUND',
        message: 'The requested resource was not found.',
      };

    case 409:
      // Conflict
      return {
        type: 'CONFLICT',
        message: 'Resource already exists.',
      };

    case 429:
      // Rate limit
      return {
        type: 'RATE_LIMIT',
        message: 'Too many requests. Please try again later.',
        retryAfter: error.response.headers['retry-after'],
      };

    case 500:
    case 502:
    case 503:
      // Server error
      return {
        type: 'SERVER_ERROR',
        message: 'Server error occurred. Please try again later.',
      };

    default:
      return {
        type: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred.',
      };
  }
};

// Usage in components
import { handleApiError } from '../services/apiErrorHandler';
import { toast } from 'react-hot-toast';

const handleCreateQuiz = async (quizData) => {
  try {
    await quizService.createQuiz(quizData);
    toast.success('Quiz created successfully!');
  } catch (error) {
    const handledError = handleApiError(error);
    toast.error(handledError.message);

    if (handledError.type === 'VALIDATION_ERROR') {
      // Show validation errors next to form fields
      setValidationErrors(handledError.details);
    }
  }
};
```

---

## ✅ Best Practices

### 1. Pagination

Always use pagination for list endpoints:
```typescript
// ✅ Good
const response = await apiClient.get('/quizzes', {
  params: { page: 1, limit: 20 }
});

// ❌ Bad - fetching all items
const response = await apiClient.get('/quizzes');
```

### 2. Optimistic Updates

Implement optimistic updates for better UX:
```typescript
const queryClient = useQueryClient();

const useSubmitReview = () => {
  return useMutation({
    mutationFn: flashcardService.submitReview,

    // Optimistic update
    onMutate: async (newData) => {
      await queryClient.cancelQueries(['flashcard-cards']);

      const previousCards = queryClient.getQueryData(['flashcard-cards']);

      queryClient.setQueryData(['flashcard-cards'], (old: any) => {
        // Update the card optimistically
        return {
          ...old,
          data: old.data.map((card: Flashcard) =>
            card.id === newData.flashcardId
              ? { ...card, status: 'REVIEWING' }
              : card
          ),
        };
      });

      return { previousCards };
    },

    // Rollback on error
    onError: (err, newData, context) => {
      queryClient.setQueryData(['flashcard-cards'], context.previousCards);
    },

    // Invalidate on success
    onSettled: () => {
      queryClient.invalidateQueries(['flashcard-cards']);
    },
  });
};
```

### 3. Debouncing Search

Implement debouncing for search functionality:
```typescript
import { debounce } from 'lodash';
import { useState, useCallback } from 'react';

const SearchComponent = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const debouncedSearch = useCallback(
    debounce((value: string) => {
      // Trigger search API call
      performSearch(value);
    }, 300),
    []
  );

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    debouncedSearch(value);
  };
};
```

### 4. Loading States

Show appropriate loading states:
```typescript
const QuizList = () => {
  const { data, isLoading, isError } = useGetUserQuizzes();

  if (isLoading) {
    return <SkeletonLoader count={5} />; // Show skeleton loaders
  }

  if (isError) {
    return <ErrorMessage message="Failed to load quizzes" />;
  }

  return <QuizList quizzes={data.data} />;
};
```

### 5. Form Validation

Validate on the frontend before API calls:
```typescript
const QuizForm = () => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (data: Partial<Quiz>) => {
    const newErrors: Record<string, string> = {};

    if (!data.name || data.name.trim().length === 0) {
      newErrors.name = 'Name is required';
    }

    if (data.name && data.name.length > 255) {
      newErrors.name = 'Name must be less than 255 characters';
    }

    if (data.questionCount && (data.questionCount < 1 || data.questionCount > 100)) {
      newErrors.questionCount = 'Question count must be between 1 and 100';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (data: Partial<Quiz>) => {
    if (!validate(data)) return;

    try {
      await quizService.createQuiz(data);
      // Success handling
    } catch (error) {
      // Error handling
    }
  };
};
```

### 6. Cache Management

Properly invalidate cache:
```typescript
const useDeleteQuiz = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: quizService.deleteQuiz,

    onSuccess: () => {
      // Invalidate all quiz queries
      queryClient.invalidateQueries({ queryKey: ['quizzes'] });

      // Or target specific queries
      queryClient.invalidateQueries({
        queryKey: ['quizzes', 'user'],
      });
    },
  });
};
```

### 7. TypeScript Types

Always use TypeScript for type safety:
```typescript
// Define interfaces
interface CreateQuizDto {
  name: string;
  description?: string;
  topic?: string;
  // ... other fields
}

// Use in service
const createQuiz = async (data: CreateQuizDto): Promise<Quiz> => {
  const response = await apiClient.post('/quizzes', data);
  return response.data;
};
```

### 8. Topic-Based Organization

Use consistent topic naming:
- Use `HSK1`, `HSK2`, `HSK3`, `HSK4`, `HSK5` for Chinese proficiency levels
- Keep topic names short and consistent
- Validate topic format on frontend

```typescript
const validTopics = ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5'];

const validateTopic = (topic: string) => {
  return validTopics.includes(topic);
};
```

### 9. Spaced Repetition Patterns

For flashcard review sessions:
- Initialize sessions with `DAILY` type to get due cards only
- Show cards one by one
- Collect quality ratings (0-5) from user
- Submit quality immediately after each card review
- Call `complete` when session is done

```typescript
const ReviewSession = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { mutate: startSession, data: session } = useStartReviewSession();
  const { mutate: submitReview } = useSubmitReview();
  const { mutate: completeSession } = useCompleteReviewSession();

  useEffect(() => {
    startSession({ limit: 20, type: 'DAILY' });
  }, []);

  const handleCardReview = (quality: number) => {
    const currentCard = session.cards[currentIndex];

    submitReview(
      { flashcardId: currentCard.id, quality },
      {
        onSuccess: () => {
          if (currentIndex < session.cards.length - 1) {
            setCurrentIndex(currentIndex + 1);
          } else {
            completeSession(session.id);
          }
        },
      }
    );
  };
};
```

---

## 📊 Common Use Cases

### Use Case 1: Create Quiz with Questions

```typescript
const createCompleteQuiz = async () => {
  // Step 1: Create quiz
  const quiz = await quizService.createQuiz({
    name: 'HSK1 Vocabulary Test',
    topic: 'HSK1',
    questionCount: 10,
    timeLimit: 600,
    passingScore: 70,
  });

  // Step 2: Add questions
  const questions = [
    {
      question: 'How do you say "hello"?',
      type: 'MULTIPLE_CHOICE' as const,
      options: ['Hello', 'Thank you', 'Goodbye', 'Sorry'],
      correctAnswer: 'Hello',
      explanation: 'Basic greeting',
      points: 1,
    },
    // ... more questions
  ];

  await quizService.bulkCreateQuestions(quiz.id, questions);

  return quiz;
};
```

### Use Case 2: Study Session

```typescript
const completeStudySession = async (deckId: string) => {
  // Step 1: Start review session
  const session = await flashcardService.startReviewSession({
    deckId,
    limit: 20,
    type: 'DAILY',
  });

  // Step 2: Review each card
  for (const card of session.cards) {
    // Show card to user
    const quality = await showCardAndGetQuality(card);

    // Submit quality rating
    await flashcardService.submitReview({
      flashcardId: card.id,
      quality,
    });
  }

  // Step 3: Complete session
  const result = await flashcardService.completeReviewSession(session.id);

  return result;
};
```

### Use Case 3: Take Quiz

```typescript
const takeQuiz = async (quizId: string) => {
  // Step 1: Start session
  const session = await quizService.startQuizSession(quizId);

  // Step 2: Answer questions
  for (const question of session.quiz.questions) {
    // Show question
    const answer = await showQuestionAndGetAnswer(question);

    // Submit answer
    await quizService.submitAnswer(session.id, {
      questionId: question.id,
      answer,
      timeSpent: calculateTimeSpent(),
    });
  }

  // Step 3: Complete quiz
  const result = await quizService.completeQuizSession(session.id);

  return result;
};
```

---

## 🚀 Quick Start Examples

### Creating Your First Quiz

```typescript
import { quizService } from './services/quizService';

const createFirstQuiz = async () => {
  // 1. Create the quiz
  const quiz = await quizService.createQuiz({
    name: 'My First Quiz',
    description: 'Test your knowledge',
    topic: 'HSK1',
    questionCount: 5,
    timeLimit: 300,
    passingScore: 80,
  });

  console.log('Quiz created:', quiz.id);

  // 2. Add questions
  await quizService.bulkCreateQuestions(quiz.id, [
    {
      question: 'What does 你好 mean?',
      type: 'MULTIPLE_CHOICE',
      options: ['Hello', 'Goodbye', 'Thank you', 'Sorry'],
      correctAnswer: 'Hello',
      explanation: '你好 is the most common greeting',
    },
    {
      question: '谢谢 means thank you',
      type: 'TRUE_FALSE',
      correctAnswer: 'TRUE',
    },
  ]);

  console.log('Questions added!');

  return quiz;
};
```

### Creating Your First Flashcard Deck

```typescript
import { flashcardService } from './services/flashcardService';

const createFirstDeck = async () => {
  // 1. Create deck
  const deck = await flashcardService.createDeck({
    name: 'Basic Chinese',
    description: 'Essential vocabulary',
    topic: 'HSK1',
    color: '#3498db',
  });

  console.log('Deck created:', deck.id);

  // 2. Add flashcards
  await flashcardService.bulkCreateFlashcards([
    {
      front: '你好',
      back: 'hello',
      pronunciation: 'nǐ hǎo',
      deckId: deck.id,
    },
    {
      front: '谢谢',
      back: 'thank you',
      pronunciation: 'xiè xie',
      deckId: deck.id,
    },
  ]);

  console.log('Flashcards added!');

  return deck;
};
```

---

## 🔍 Additional Resources

### API Testing with Swagger

- Access Swagger UI at: `http://localhost:3000/api`
- Test endpoints directly from the browser
- View request/response schemas

### Database Schema

Learn more about the data structure:
- Quiz and QuizQuestion entities: `src/modules/education/entities/`
- Flashcard and FlashcardDeck entities
- User progress tracking: UserVocabulary, UserCourse, UserLesson
- Streak tracking: UserStreak

### Migration Commands

```bash
# Create new migration
npm run migration:create --name=your-migration-name

# Run migrations
npm run migration:run

# Show migration status
npm run migration:show
```

---

## 📞 Support

For questions or issues:
1. Check existing issues in the repository
2. Review NestJS documentation: https://docs.nestjs.com/
3. Review TypeORM documentation: https://typeorm.io/

---

*Generated: 2026-04-08*
*API Version: 1.0.0*
