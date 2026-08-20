# Design: Tách "God" Service & Controller thành Use-case Services + Facade

Ngày: 2026-08-20
Phạm vi: backend (`education_be`)

## Vấn đề

Bốn service và hai controller đã phình to thành "god" class, khó maintain:

- `modules/education/quiz.service.ts` (1.129 dòng)
- `modules/education/flashcard.service.ts` (1.026 dòng)
- `modules/education/education.service.ts` (1.257 dòng)
- `modules/soulie/soulie.service.ts` (1.303 dòng)
- `modules/document-import/document-import.controller.ts` (479 dòng)
- `modules/education/quiz.controller.ts` (413 dòng)

## Ràng buộc (không đổi, đã chốt)

1. **Không đổi hành vi** — refactor thuần cấu trúc, giữ nguyên logic nghiệp vụ và kết quả.
2. **Facade giữ nguyên public API** — `QuizService`, `FlashcardService`, `EducationService`, `SoulieService` giữ nguyên tên class, danh sách public method và signature. Các consumer bên ngoài KHÔNG được vỡ:
   - `document-import/generators/quiz-generator.service.ts` gọi `QuizService.createQuiz`, `bulkCreateQuizQuestions`
   - `document-import/generators/flashcard-generator.service.ts` và `document-import/document-preview.service.ts` gọi `FlashcardService.createDeck`, `bulkCreateFlashcards`
   - `education.module.ts` export `EducationService`, `FlashcardService`, `QuizService` (giữ nguyên export)
   - Toàn bộ spec test hiện có (`*.spec.ts`) phải xanh.
3. **Mọi test phải xanh** — từng bước chạy `npm run lint:check` + `npm run build` + spec liên quan; cuối cùng `npm run ci` xanh.

## Kiến trúc

- Giữ facade cũ (tên class + public method không đổi). Mỗi public method chỉ delegate sang use-case service tương ứng.
- Mỗi use-case service đặt tại `modules/<module>/services/*.service.ts`, đăng ký trong `providers` của module. KHÔNG export ra ngoài — chỉ facade được export.
- Helper thuần (không phụ thuộc DI) và policy đặt tại `modules/<module>/domain/` theo pattern đã có `education/domain/quiz-grading.policy.ts`.
- Use-case service có thể giảm `private` thành dependency tương hỗ hoặc dùng domain helper; không tạo vòng phụ thuộc vô hạn.

### 1. `quiz.service.ts` → facade `QuizService` + 5 use-case
- `QuizManagementService` (services/quiz-management.service.ts): `createQuiz`, `getQuizzes`, `getQuizById`, `updateQuiz`, `deleteQuiz`, `getPublicQuizzes`
- `QuizQuestionService` (services/quiz-question.service.ts): `createQuizQuestion`, `bulkCreateQuizQuestions`, `getQuizQuestions`, `updateQuizQuestion`, `deleteQuizQuestion`
  - helper `getOwnedQuizById` (hiện là `private` trong QuizService) chuyển thành `domain/quiz-ownership.ts`.
- `QuizGenerationService` (services/quiz-generation.service.ts): `generateQuizFromFlashcards` + các helper `generate*Question`, `getRandomFlashcards`, `getRandomWrongAnswer(s)`, `shuffleArray`, `tryAiMcqDistractors`
- `QuizSessionService` (services/quiz-session.service.ts): `startQuizSession`, `submitQuizAnswer`, `completeQuizSession`, `getQuizSession`, `getQuizSessionQuestions`, `getQuizSessions`, `toSessionQuestion`, `getNextAttemptNumber`
- `QuizStatisticsService` (services/quiz-statistics.service.ts): `getQuizStats`, `getQuizStatsByTopic`, `getQuizHistory`, `getWrongAnswers`, `getLeaderboard`, `fillMissingWrongAnswerExplanations`
- Các hàm helper export ở cuối file (`buildQuizSessionQuestionOrder`, `isQuestionInSessionOrder`, `hasAnsweredQuestion`, `calculateQuizSessionProgress`, `buildQuizStatsResult`, `buildTopicQuizStatsResult`, `parseNumericStat`, `uniqueNonEmpty`) chuyển sang `domain/quiz-helpers.ts` như functions thuần (giữ nguyên export để spec không vỡ).

### 2. `flashcard.service.ts` → facade `FlashcardService` + 4 use-case
- `FlashcardDeckService` (services/flashcard-deck.service.ts): `createDeck`, `getDecks`, `getDeckById`, `updateDeck`, `deleteDeck`, `getPublicDecks`, `getDecksByTopic`, `getAvailableTopics`
- `FlashcardItemService` (services/flashcard-item.service.ts): `createFlashcard`, `bulkCreateFlashcards`, `getFlashcards`, `getFlashcardById`, `updateFlashcard`, `deleteFlashcard`, `searchFlashcards`, `importFromVocabulary`, `importFromVocabularyBulk`
- `FlashcardReviewService` (services/flashcard-review.service.ts): `startReviewSession`, `reviewFlashcard`, `completeReviewSession`, `getFlashcardsToReview`, `getDueFlashcardsCount` (spaced repetition)
- `FlashcardStatisticsService` (services/flashcard-statistics.service.ts): `getFlashcardStats`, `getDeckStats`, `getReviewHistory`

### 3. `education.service.ts` → facade `EducationService` + 6 use-case
- `CourseCatalogService` (services/course-catalog.service.ts): `getLanguages`, `getLanguageById`, `resolveLanguageId`, `getCourses`, `getCourseById`, `createCourse`, `updateCourse`
- `UserCourseService` (services/user-course.service.ts): `enrollCourse`, `getUserCourses`, `getUserProgress`
- `LessonContentService` (services/lesson-content.service.ts): `getLessonsByCourse`, `getLessonById`, `createLesson`, `completeLesson`, `getExercisesByLesson`, `createExercise`, `submitExercises`
- `VocabularyService` (services/vocabulary.service.ts): `getVocabularyByLesson`, `createVocabulary`, `getVocabularyToReview`, `reviewVocabulary`
- `LearningPlanService` (services/learning-plan.service.ts): `getLearningPlan`, `getLearningCoachSummary`, `getTodayPlan`, `getTodayLearningHub`, `getTodayRecommendations`, `markTodayPlanTaskComplete`, `markTodayPlanTasksCompleteByTarget`, `markTodayPlanTasksCompleteByType`
- `StreakService` (services/streak.service.ts): `getUserStreak`

### 4. `soulie.service.ts` → facade `SoulieService` + 6 use-case
- `FriendService` (services/friend.service.ts): `getFriends`, `discoverUsers`, `getFriendRequests`, `createFriendRequest`, `acceptFriendRequest`, `rejectFriendRequest`, `removeFriend`
- `ConversationService` (services/conversation.service.ts): `getConversations`, `createDirectConversation`, `getConversationMessages`, `sendConversationMessage`, `markConversationRead`
- `MomentService` (services/moment.service.ts): `createMoment`, `getMoments`, `markMomentOpened`, `getJournal`
- `ProfileService` (services/profile.service.ts): `getProfile`, `updateProfile`
- `SoulieChatService` (services/soulie-chat.service.ts): `getChats`, `getChatThread`, `sendChatMessage`
- `SoulieHomeService` (services/soulie-home.service.ts): `getHome`, `getWidget`, `getCameraRecipients`

### 5. `document-import.controller.ts` (479) → controller mỏng
- Business logic hiện đang nằm trong controller chuyển xuống service/handler:
  - `DocumentImportService` (đã tồn tại): phương thức làm tay lái cho controller.
  - `DocumentPreviewService` (đã tồn tại): xử lý preview.
  - `convertDocument`/`uploadDocument` logic chia vào handler/converter riêng (đã có `generators/`, `parsers/`).
- Controller chỉ còn: decorators (route/guard), phân quyền, parse param, và gọi service, trả về dữ liệu thẳng.

### 6. `quiz.controller.ts` (413) → controller mỏng
- Gom phần lặp (pagination từ query, build response) vào helper/mapper riêng (`quiz-http.mapper.ts` trong cùng thư mục controller).
- Bỏ trùng lặp route về cùng một service method (ví dụ `getAllQuizSessions` → `getQuizSessions`, `getAllWrongAnswers` → `getWrongAnswers`), controller chỉ thêm param khác nhau.
- Không thay đổi contract HTTP.

## Kiểm chứng

Mỗi bước (từng file):
1. Tách theo phân rã trên, keep facade public API không đổi.
2. `npm run lint:check` — không lỗi mới.
3. `npm run build` — TS pass.
4. Chạy spec liên quan (vd `quiz.service.spec.ts`, `flashcard*.spec.ts`, `education-social.service.spec.ts`...) xanh.

Cuối toàn bộ:
- `npm run ci` (eslint + jest + build) xanh.

Thứ tự thực hiện (rủi ro thấp → cao):
1. `quiz.service.ts`
2. `flashcard.service.ts`
3. `education.service.ts`
4. `soulie.service.ts`
5. `document-import.controller.ts`
6. `quiz.controller.ts`

## Ngoài phạm vi
- Không đổi DB schema / migration.
- Không đổi DTO / contract API.
- Không đổi logic nghiệp vụ.
- Không đổi tên facade class hay public method.