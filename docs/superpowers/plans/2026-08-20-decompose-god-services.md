# Decompose God Services & Controllers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách 4 god service và 2 god controller `education_be` thành use-case services + facade mà không đổi hành vi, giữ mọi test xanh.

**Architecture:** Mỗi god service trở thành facade (giữ nguyên tên class + public method + signature) delegate sang các use-case service. Use-case service đặt ở `modules/<module>/services/`, pure helper chuyển sang `domain/`. Facade vẫn là thứ duy nhất được export khỏi module nên consumer ngoài (`quiz-generator`, `flashcard-generator`, `document-preview`) không vỡ.

**Tech Stack:** NestJS 11, TypeORM 0.3, Jest. Đây là refactor dời code verbatim bảo toàn hành vi — "test" ở đây là các spec hiện có, phải xanh sau mỗi bước.

**Nguyên tắc triển khai (BẮT BUỘC):**
- Dời method **verbatim** (giữ nguyên thân hàm). Không "cải tiến" logic tỏng lúc refactor.
- Mọi import mới phải đúng đường dẫn tương đối theo vị trí file đích.
- Mỗi use-case file phải có đầy đủ `import` cho mọi symbol nó dùng.
- Sau mỗi Task: `npm run lint:check` + `npm run build` + spec liên quan xanh → commit.
- Nhận diện dead code (`findExistingFlashcard`, mock buộc) nhưng KHÔNG xóa ngoài phạm vi thiết kế.

---

## Task 1: Tách `quiz.service.ts` thành facade + 5 use-case

**Files:**
- Create: `src/modules/education/services/quiz-management.service.ts`
- Create: `src/modules/education/services/quiz-question.service.ts`
- Create: `src/modules/education/services/quiz-generation.service.ts`
- Create: `src/modules/education/services/quiz-session.service.ts`
- Create: `src/modules/education/services/quiz-statistics.service.ts`
- Create: `src/modules/education/domain/quiz-ownership.ts`
- Create: `src/modules/education/domain/quiz-helpers.ts`
- Modify: `src/modules/education/quiz.service.ts` (→ facade)
- Modify: `src/modules/education/education.module.ts`

- [ ] **Step 1: Tạo `domain/quiz-ownership.ts`** — helper `getOwnedQuizById` (hiện private trong QuizService, dòng 157–167) thành hàm thuần nhận repository:

```ts
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { Quiz } from '../entities';

export async function getOwnedQuizById(
  quizRepository: Repository<Quiz>,
  quizId: string,
  userId: number,
): Promise<Quiz> {
  const quiz = await quizRepository.findOne({ where: { id: quizId, userId } });
  if (!quiz) {
    throw new NotFoundException('Quiz not found');
  }
  return quiz;
}
```

- [ ] **Step 2: Tạo `domain/quiz-helpers.ts`** — dời VERBATIM các hàm export ở cuối `quiz.service.ts` (dòng 1038–1129) vào đây và export: `buildQuizSessionQuestionOrder`, `isQuestionInSessionOrder`, `hasAnsweredQuestion`, `calculateQuizSessionProgress`, `QuizStatsResultInput`, `buildQuizStatsResult`, `TopicQuizStatsResultInput`, `buildTopicQuizStatsResult`, `parseNumericStat`, `uniqueNonEmpty`. Import chúng về `quiz.service.ts` để facade/spec giữ nguyên export (KHÔNG xóa export khỏi `quiz.service.ts`).

- [ ] **Step 3: Tạo `services/quiz-management.service.ts`** — class `QuizManagementService`, inject `quizRepository` (`@InjectRepository(Quiz)`). Dời VERBATIM từ `quiz.service.ts`: `createQuiz`(46–52), `getQuizzes`(54–83), `getQuizById`(85–99), `updateQuiz`(101–105), `deleteQuiz`(107–111), `getPublicQuizzes`(113–132). `updateQuiz`/`deleteQuiz` dùng `getOwnedQuizById` từ `../domain/quiz-ownership`.

- [ ] **Step 4: Tạo `services/quiz-question.service.ts`** — class `QuizQuestionService`, inject `quizRepository` + `quizQuestionRepository`. Dời VERBATIM: `createQuizQuestion`(136–155), `bulkCreateQuizQuestions`(169–198), `getQuizQuestions`(200–212), `updateQuizQuestion`(214–236), `deleteQuizQuestion`(238–261). Dùng `getOwnedQuizById` (cho `createQuizQuestion`) và `getQuizById` qua repository (dời logic `getQuizById` public vào đây như private helper `getViewableQuizById`).

- [ ] **Step 5: Tạo `services/quiz-generation.service.ts`** — class `QuizGenerationService`, inject `quizRepository`, `quizQuestionRepository`, `flashcardRepository`, và `AiService`. Dời VERBATIM: `generateQuizFromFlashcards`(265–345), `generateMultipleChoiceQuestion`(347–368), `tryAiMcqDistractors`(370–409), `generateTrueFalseQuestion`(411–428), `generateFillBlankQuestion`(430–445), `getQuestionType`(447–463), `getRandomFlashcards`(465–502), `getRandomWrongAnswers`(504–517), `getRandomWrongAnswer`(519–522), `shuffleArray`(524–531).

- [ ] **Step 6: Tạo `services/quiz-session.service.ts`** — class `QuizSessionService`, inject `quizRepository`, `quizQuestionRepository`, `quizSessionRepository`. Dời VERBATIM: `startQuizSession`(535–601), `submitQuizAnswer`(603–677), `completeQuizSession`(679–710), `getQuizSession`(712–723), `getQuizSessionQuestions`(725–744), `toSessionQuestion`(746–758), `getQuizSessions`(760–790), `getNextAttemptNumber`(792–800). Import các helper thuần `buildQuizSessionQuestionOrder`, `isQuestionInSessionOrder`, `hasAnsweredQuestion` từ `../domain/quiz-helpers`.

- [ ] **Step 7: Tạo `services/quiz-statistics.service.ts`** — class `QuizStatisticsService`, inject `quizRepository`, `quizQuestionRepository`, `quizSessionRepository`, `AiService`. Dời VERBATIM: `getQuizStats`(804–847), `getQuizStatsByTopic`(849–902), `getQuizHistory`(904–924), `getWrongAnswers`(926–969), `fillMissingWrongAnswerExplanations`(971–1004), `getLeaderboard`(1006–1035). Import `buildQuizStatsResult`, `buildTopicQuizStatsResult`, `parseNumericStat`, `uniqueNonEmpty` từ `../domain/quiz-helpers`.

- [ ] **Step 8: Biến `quiz.service.ts` thành facade** — giữ class `QuizService`, giữ nguyên public method + signature. `QuizService` inject 5 use-case service trên, bỏ construct repo/AiService cũ, mỗi public method delegate:

```ts
@Injectable()
export class QuizService {
  constructor(
    private readonly quizManagement: QuizManagementService,
    private readonly quizQuestion: QuizQuestionService,
    private readonly quizGeneration: QuizGenerationService,
    private readonly quizSession: QuizSessionService,
    private readonly quizStatistics: QuizStatisticsService,
  ) {}

  createQuiz(userId: number, dto: CreateQuizDto) {
    return this.quizManagement.createQuiz(userId, dto);
  }
  // ... một dòng delegate cho mỗi public method, giữ nguyên signature như cũ
}
```

  Giữ nguyên các export function ở cuối (re-export từ `domain/quiz-helpers`) để spec không vỡ.

- [ ] **Step 9: Cập nhật `education.module.ts`** — thêm 5 use-case service vào `providers` (trước/sau `QuizService`, KHÔNG export chúng):

```ts
providers: [
  EducationService,
  // ...
  FlashcardService,
  QuizService,
  QuizManagementService,
  QuizQuestionService,
  QuizGenerationService,
  QuizSessionService,
  QuizStatisticsService,
],
```

- [ ] **Step 10: Kiểm chứng** — Chạy:
  - `npm run lint:check` (không lỗi mới)
  - `npm run build`
  - `npx jest quiz --silent` (mọi spec quiz xanh)
- [ ] **Step 11: Commit**

```bash
git add src/modules/education
git commit -m "refactor(quiz): split god service into use-case services + facade"
```

---

## Task 2: Tách `flashcard.service.ts` thành facade + 4 use-case

**Files:**
- Create: `src/modules/education/services/flashcard-deck.service.ts`
- Create: `src/modules/education/services/flashcard-item.service.ts`
- Create: `src/modules/education/services/flashcard-review.service.ts`
- Create: `src/modules/education/services/flashcard-statistics.service.ts`
- Modify: `src/modules/education/flashcard.service.ts` (→ facade)
- Modify: `src/modules/education/education.module.ts`

- [ ] **Step 1: Tạo `services/flashcard-deck.service.ts`** — class `FlashcardDeckService`, inject `flashcardDeckRepository`. Dời VERBATIM từ `flashcard.service.ts`: `createDeck`(67–74), `getDecks`(76–105), `getDeckById`(107–117), `updateDeck`(119–127), `deleteDeck`(129–133), `getPublicDecks`(135–154), `getDecksByTopic`(156–181), `getAvailableTopics`(183–198).

- [ ] **Step 2: Tạo `services/flashcard-item.service.ts`** — class `FlashcardItemService`, inject `flashcardRepository`, `flashcardDeckRepository`, `vocabularyRepository`, `lessonRepository`. Dời VERBATIM: `createFlashcard`(202–231), `bulkCreateFlashcards`(233–275), `getFlashcards`(277–306), `getFlashcardById`(308–325), `updateFlashcard`(327–344), `deleteFlashcard`(346–362), `searchFlashcards`(364–391), `importFromVocabulary`(395–451), `importFromVocabularyBulk`(453–487), `createFlashcardFromVocabulary`(489–511), `checkDuplicateFlashcard`(513–521), `mapCourseLevelToTopic`(532–543). Bỏ helper dead `findExistingFlashcard`(523–530) — không nơi nào gọi. `getDeckById`/`getFlashcardById` dùng qua `FlashcardDeckService`/nội bộ (dời 1 bản private helper `getOwnedDeckById` + `getOwnedFlashcardById`).

- [ ] **Step 3: Tạo `services/flashcard-review.service.ts`** — class `FlashcardReviewService`, inject `flashcardRepository`, `userFlashcardRepository`, `reviewSessionRepository`, `userStreakRepository`, `flashcardDeckRepository`. Dời VERBATIM: `startReviewSession`(547–563), `reviewFlashcard`(565–633), `completeReviewSession`(635–679), `getFlashcardsToReview`(681–723), `getDueFlashcardsCount`(966–979), `calculateSRS`(725–737), `updateFlashcardStatus`(739–761), `updateStreak`(763–805), `getUserFlashcardStreakStats`(807–816), `getUserFlashcardXpTotal`(818–824). Import domain SRS từ `../domain/srs.policy` đã tồn tại.

- [ ] **Step 4: Tạo `services/flashcard-statistics.service.ts`** — class `FlashcardStatisticsService`, inject `flashcardRepository`, `flashcardDeckRepository`, `userFlashcardRepository`, `reviewSessionRepository`, `userStreakRepository`. Dời VERBATIM: `getFlashcardStats`(828–881), `getDeckStats`(883–943), `getReviewHistory`(945–964). Dời interface + pure helper `FlashcardStatsResultInput`/`buildFlashcardStatsResult`(982–1004) và `DeckStatsResultInput`/`buildDeckStatsResult`(1006–1026) thành export trong use-case hoặc `domain/flashcard-stats.builder.ts`.

- [ ] **Step 5: Biến `flashcard.service.ts` thành facade** — giữ class `FlashcardService`, giữ public method + signature, inject 4 use-case và delegate. Giữ export của `buildFlashcardStatsResult`/`buildDeckStatsResult` (re-export) để spec/consumer không vỡ.

- [ ] **Step 6: Cập nhật `education.module.ts`** — thêm 4 use-case service vào `providers` (KHÔNG export). Lưu ý `document-import` vẫn import `FlashcardService` (facade) nên public method `createDeck`, `bulkCreateFlashcards` phải còn nguyên trên facade.

- [ ] **Step 7: Kiểm chứng** — `npm run lint:check`, `npm run build`, `npx jest flashcard --silent` (xanh).
- [ ] **Step 8: Commit**

```bash
git add src/modules/education
git commit -m "refactor(flashcard): split god service into use-case services + facade"
```

---

## Task 3: Tách `education.service.ts` thành facade + 6 use-case

**Files:**
- Create: `src/modules/education/services/course-catalog.service.ts`
- Create: `src/modules/education/services/user-course.service.ts`
- Create: `src/modules/education/services/lesson-content.service.ts`
- Create: `src/modules/education/services/vocabulary.service.ts`
- Create: `src/modules/education/services/learning-plan.service.ts`
- Create: `src/modules/education/services/streak.service.ts`
- Modify: `src/modules/education/education.service.ts` (→ facade)
- Modify: `src/modules/education/education.module.ts`

- [ ] **Step 1: Tạo `services/course-catalog.service.ts`** — class `CourseCatalogService`, inject `languageRepository`, `courseRepository`. Dời VERBATIM từ `education.service.ts`: `getLanguages`(140–145), `getLanguageById`(147–153), `resolveLanguageId`(155–164), `getCourses`(167–199), `getCourseById`(201–210), `createCourse`(212–219), `updateCourse`(221–225).

- [ ] **Step 2: Tạo `services/user-course.service.ts`** — class `UserCourseService`, inject `userCourseRepository`, `courseRepository`. Dời VERBATIM: `enrollCourse`(228–246), `getUserCourses`(248–254).

- [ ] **Step 3: Tạo `services/lesson-content.service.ts`** — class `LessonContentService`, inject `lessonRepository`, `courseRepository`, `exerciseRepository`, `userLessonRepository`, `userCourseRepository`, `userStreakRepository`. Dời VERBATIM: `getLessonsByCourse`(257–280), `getLessonById`(282–291), `createLesson`(293–315), `completeLesson`(317–365), `updateCourseLessonCount`(367–372), `updateCourseProgress`(374–404), `getExercisesByLesson`(509–514), `createExercise`(516–532), `submitExercises`(534–584), `checkAnswer`(586–604). `submitExercises` gọi `getExercisesByLesson`; `completeLesson`/`submitExercises` gọi `updateStreak` (đặt trong `StreakService`, xem Step 5) → `lesson-content` inject `StreakService`.

- [ ] **Step 4: Tạo `services/vocabulary.service.ts`** — class `VocabularyService`, inject `vocabularyRepository`, `lessonRepository`, `userVocabularyRepository`. Dời VERBATIM: `getVocabularyByLesson`(407–430), `createVocabulary`(432–448), `getVocabularyToReview`(450–467), `reviewVocabulary`(469–506).

- [ ] **Step 5: Tạo `services/streak.service.ts`** — class `StreakService`, inject `userStreakRepository`. Dời VERBATIM: `getUserStreak`(607–616), `updateStreak`(618–662). Export `updateStreak` (public) vì `lesson-content.service` và `user-course`/các nơi gọi.

- [ ] **Step 6: Tạo `services/learning-plan.service.ts`** — class `LearningPlanService`, inject `userCourseRepository`, `lessonRepository`, `userLessonRepository`, `userVocabularyRepository`, `userStreakRepository`, `quizSessionRepository`, `dailyLearningTaskRepository`, `aiService` (theo coupling map: không dùng `courseRepository`). Dời VERBATIM: `getLearningPlan`(704–902), `getLearningCoachSummary`(904–977), `getTodayPlan`(979–1070), `getTodayLearningHub`(1072–1182), `getTodayRecommendations`(1184–1186), `markTodayPlanTaskComplete`(1188–1223), `markTodayPlanTasksCompleteByTarget`(1225–1234), `markTodayPlanTasksCompleteByType`(1236–1256). Dời `getTodayDateKey`(105–109) thành export thuần hoặc helper trong file (hiện module-private) và export khỏi use-case cho spec.

- [ ] **Step 7: Biến `education.service.ts` thành facade** — giữ class `EducationService`, giữ public method + signature, inject 6 use-case và delegate. Đặc biệt giữ nguyên `getLearningPlan` (được `getTodayPlan` etc. dùng trước đây nội bộ) vẫn expose public để spec/consumer không vỡ.

- [ ] **Step 8: Cập nhật `education.module.ts`** — thêm 6 use-case vào `providers` (KHÔNG export). `document-import` và `flashcard.controller`/`quiz.controller` vẫn import `EducationService` facade.

- [ ] **Step 9: Kiểm chứng** — `npm run lint:check`, `npm run build`, `npx jest education --silent` (xanh).
- [ ] **Step 10: Commit**

```bash
git add src/modules/education
git commit -m "refactor(education): split god service into use-case services + facade"
```

---

## Task 4: Tách `soulie.service.ts` thành facade + 6 use-case

**Files:**
- Create: `src/modules/soulie/services/friend.service.ts`
- Create: `src/modules/soulie/services/conversation.service.ts`
- Create: `src/modules/soulie/services/moment.service.ts`
- Create: `src/modules/soulie/services/profile.service.ts`
- Create: `src/modules/soulie/services/soulie-chat.service.ts`
- Create: `src/modules/soulie/services/soulie-home.service.ts`
- Create: `src/modules/soulie/domain/soulie-utils.ts` (pure display/format helpers)
- Modify: `src/modules/soulie/soulie.service.ts` (→ facade)
- Modify: `src/modules/soulie/soulie.module.ts`

- [ ] **Step 1: Tạo `domain/soulie-utils.ts`** — export hàm thuần dời VERBATIM từ các private helper dùng chung: `getDisplayName`(1181–1190), `getPublicDisplayName`(1192–1198), `getPublicUsername`(1200–1204), `isUserOnline`(1206–1212), `formatTimeAgo`(1214–1234), `formatShortAge`(1236–1238), `formatClock`(1240–1245), `calculateStreak`(1066–1084). Các use-case import từ đây.

- [ ] **Step 2: Tạo `services/friend.service.ts`** — class `FriendService`, inject `usersService`, `userRepository`, `friendshipRepository`, `friendDto` helpers. Dời VERBATIM: `getFriends`(122–153), `discoverUsers`(155–196), `getFriendRequests`(198–226), `createFriendRequest`(228–273), `acceptFriendRequest`(275–297), `rejectFriendRequest`(299–321), `removeFriend`(323–334), `buildUserRelationMap`(748–778), `resolveRequestTarget`(780–808), `findFriendshipBetween`(810–818), `findAcceptedFriendship`(820–836), `toFriendDto`(1137–1150), `toFriendRequestDto`(1152–1166), `toUserSuggestionDto`(1168–1179), `parseUserId`(1295–1302). `getAcceptedFriendUsers`(731–746) là helper dùng chung → đặt public trên `FriendService` (facade + các use-case khác dùng).

- [ ] **Step 3: Tạo `services/conversation.service.ts`** — class `ConversationService`, inject các repo conversation/message + `friendService` (dùng `getAcceptedFriendUsers`, `resolveAcceptedFriend`). Dời VERBATIM: `getConversations`(336–373), `createDirectConversation`(375–388), `getConversationMessages`(390–409), `sendConversationMessage`(411–439), `markConversationRead`(441–454), `listConversationsForUser`(838–844), `getUnreadCountMap`(846–866), `toConversationSummaryDto`(868–888), `getFriendFromConversation`(890–897), `getConversationForUser`(899–919), `getDirectConversation`(921–931), `getOrCreateDirectConversation`(933–952), `normalizeParticipants`(954–958), `normalizeMessagePayload`(960–971), `toMessageDto`(973–987), `toFriendDto`(re-export từ `domain/soulie-utils`). Expose public: `getDirectConversation`, `getOrCreateDirectConversation`, `getUnreadCountMap`, `toConversationSummaryDto`, `sendConversationMessage` để `SoulieChatService` dùng.

- [ ] **Step 4: Tạo `services/moment.service.ts`** — class `MomentService`, inject moment repo + `friendService`/`profileService`. Dời VERBATIM: `createMoment`(456–492), `getMoments`(494–545), `markMomentOpened`(547–562), `getJournal`(564–579), `resolveMomentRecipientIds`(989–1016), `toJournalEntryDtoFromMoment`(1018–1035), `formatJournalLabel`(1247–1283), `parseUserId`(từ utils). `getJournal` dùng `getProfileStats` → đặt public trên `ProfileService` (xem Step 5).
- [ ] **Step 5: Tạo `services/profile.service.ts`** — class `ProfileService`, inject user repo + `usersService`, `friendshipRepository`, `momentRepository`. Dời VERBATIM: `getProfile`(581–596), `updateProfile`(598–622), `getProfileStats`(1037–1064), `findUserOrThrow`(1285–1293). Export `getProfileStats` public.

- [ ] **Step 6: Tạo `services/soulie-chat.service.ts`** — class `SoulieChatService`, inject `conversationService`, `friendService`. Dời VERBATIM: `getChats`(648–664), `getChatThread`(666–685), `sendChatMessage`(687–699). (Các method này đã delegate sang conversation internals.)

- [ ] **Step 7: Tạo `services/soulie-home.service.ts`** — class `SoulieHomeService`, inject `friendService`, `momentService`, `conversationService`. Dời VERBATIM: `getHome`(71–97), `getWidget`(99–120), `getCameraRecipients`(624–646), `getNotificationCount`(701–729), `toFriendActivityDto`(1112–1126), `toFriendGridItemDto`(1128–1135). Dùng `getAcceptedFriendUsers`, `getDisplayName`, `isUserOnline`, `toFriendDto`, `getProfileStats` từ các service/utils liên quan.

- [ ] **Step 8: Biến `soulie.service.ts` thành facade** — giữ class `SoulieService` + public method + signature, inject 6 use-case và delegate. Giữ public methods `getConversations` (được `getChats` dùng trước đây — giờ qua `ConversationService`). Không đổi contract DTO/route.

- [ ] **Step 9: Cập nhật `soulie.module.ts`** — thêm `FriendService`, `ConversationService`, `MomentService`, `ProfileService`, `SoulieChatService`, `SoulieHomeService` vào `providers` (KHÔNG export). Đảm bảo `UsersService` và các repo vẫn trong providers/imports.

- [ ] **Step 10: Kiểm chứng** — `npm run lint:check`, `npm run build`, `npx jest soulie --silent` (xanh).
- [ ] **Step 11: Commit**

```bash
git add src/modules/soulie
git commit -m "refactor(soulie): split god service into use-case services + facade"
```

---

## Task 5: Làm mỏng `document-import.controller.ts`

**Files:**
- Create: `src/modules/document-import/document-parse-options.helper.ts` (hoặc đặt trong service)
- Modify: `src/modules/document-import/document-import.controller.ts` (→ mỏng)
- Modify: `src/modules/document-import/document-import.module.ts`

- [ ] **Step 1: Extract file-type detection** — logic detected 2 lần (A4 previewDocument 313–323, A6 convertDocument 458–468) đưa thành 1 method trên `document-preview.service.ts`: `resolveFileType(buffer: Buffer, filename: string, override?: string): Promise<string>` (dùng `getFileTypeFromExtension` → fallback `getFileTypeFromMimeType` → throw `BadRequestException`), giữ nguyên hành vi hiện có.

- [ ] **Step 2: Extract `FileInterceptor` config** — MIME allowlist + `fileFilter` + size limit lặp 4 lần, đưa thành hằng/config dùng chung trong module (`document-upload.config.ts`), tái sử dụng ở cả 4 `@UseInterceptors`.

- [ ] **Step 3: Extract validation `file`/`fileType`** — guard `400` lặp ở `uploadDocument`(153–171) + `uploadDocumentWithPhrases`(241–259) đưa vào 1 helper nhỏ gọi từ controller, hoặc để `DocumentImportService.importDocument` tự throw; controller chỉ 1 dòng delegate.

- [ ] **Step 4: Mỏng controller** — sau các extract, mỗi handler còn: guard param nhỏ + gọi service + `return`. Xóa logic business nội tuyến. `convertDocument`: hoàn toàn delegate xuống `documentConversionService.convertDocument` (vẫn giữ `getUserId`).
- [ ] **Step 5: Kiểm chứng** — `npm run lint:check`, `npm run build`, `npx jest document-import --silent`.
- [ ] **Step 6: Commit** — `git add src/modules/document-import` + `git commit -m "refactor(document-import): slim controller, extract duplicated logic"`

---

## Task 6: Làm mỏng `quiz.controller.ts`

**Files:**
- Create: `src/modules/education/quiz-http.mapper.ts` (pagination helper)
- Create: `src/modules/education/services/quiz-session-completion.service.ts`
- Modify: `src/modules/education/quiz.controller.ts` (→ mỏng)
- Modify: `src/modules/education/education.module.ts`
- Modify: `src/modules/education/education.module.ts`

- [ ] **Step 1: Tạo `quiz-http.mapper.ts`** — export thuần `parsePagination(query: { page?: string; limit?: string }): { page: number; limit: number }` để gom phần `pagination?.page?.pagination?.limit` lặp 6 lần (B2,B3,B15,B16,B19,B22).

- [ ] **Step 2: Dời orchestration `completeQuizSession`(B12)** — 3 lần gọi tuần tự (complete + `markTodayPlanTasksCompleteByType` + `markTodayPlanTasksCompleteByTarget`) hiện nằm trong controller. KHÔNG nhét vào `QuizService` hay `EducationService` (sẽ tạo vòng phụ thuộc QuizService↔EducationService — EducationService hiện không import QuizService). Tạo orchestrator mới `src/modules/education/services/quiz-session-completion.service.ts`, class `QuizSessionCompletionService` inject `QuizService` + `EducationService`, phương thức `completeAndUpdatePlan(userId: number, sessionId: string)` thực hiện đúng 3 bước tuần tự như controller cũ và trả về `result`. Controller chỉ gọi method này.

- [ ] **Step 3: Gộp cặp cùng method** — `getAllQuizSessions`(B16) ↔ `getQuizSessions`(B15) (cùng `quizService.getQuizSessions`, khác id vs undefined) và `getAllWrongAnswers`(B21) ↔ `getWrongAnswers`(B20) (cùng `quizService.getWrongAnswers`). Giữ cả 2 route nhưng mỗi handler chỉ gọi 1 service method chung (không đổi contract HTTP, không xóa route).
- [ ] **Step 4: Mỏng controller** — thay `getUserId(req)` lặp ~20 lần bằng 1 helper `getUserId(req)` dùng chung trong module (hoặc giữ helper sẵn có — KHÔNG bắt buộc thêm decorator nếu nằm ngoài phạm vi). Thêm `QuizSessionCompletionService` vào `providers` trong `education.module.ts`. Đảm bảo thứ tự route không đổi (`@Post('generate')` trước `@Post(':id/start')`).
- [ ] **Step 5: Kiểm chứng** — `npm run lint:check`, `npm run build`, `npx jest quiz --silent`.
- [ ] **Step 6: Commit** — `git add src/modules/education/quiz.controller.ts` + `git commit -m "refactor(quiz): slim controller, extract orchestration + pagination"`

---

## Task 7: Toàn bộ kiểm chứng cuối

- [ ] **Step 1: Chạy toàn bộ CI** — `npm run ci` (eslint –jest–build) xanh, không sót lỗi.
- [ ] **Step 2: Rà soát** — mọi facade giữ public API không đổi; `education.module.ts` vẫn export đúng `EducationService`, `FlashcardService`, `QuizService`; không có import vòng phụ thuộc mới giữa các module.
- [ ] **Step 3: Commit bất kỳ thay đổi còn sót** nếu có.