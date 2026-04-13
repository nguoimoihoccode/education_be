# Flashcard System Implementation Plan

## Context

The education module currently has vocabulary learning with spaced repetition (SRS), but lacks a dedicated flashcard system. Users need a more interactive, card-based learning experience that:
- Supports both auto-generated and manually created flashcards
- Organizes cards into decks for better management
- Integrates with existing SRS algorithm for optimal learning
- Provides deduplication to avoid duplicate cards
- Offers rich multimedia content (audio, images, pronunciation, examples)

## Implementation Strategy

### Phase 1: Database Schema & Entities

#### New Entities to Create

**1. FlashcardDeck** (`edu_flashcard_decks`)
```typescript
@Entity('edu_flashcard_decks')
export class FlashcardDeck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  icon: string; // Emoji or icon URL

  @Column({ nullable: true })
  color: string; // Hex color for deck UI

  @Column({ default: 0 })
  cardCount: number;

  @Column({ type: 'enum', enum: ['SYSTEM', 'USER'], default: 'USER' })
  type: 'SYSTEM' | 'USER';

  @Column({ default: true })
  isPublic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @OneToMany(() => Flashcard, (deck) => deck.deck)
  flashcards: Flashcard[];
}
```

**2. Flashcard** (`edu_flashcards`)
```typescript
@Entity('edu_flashcards')
export class Flashcard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  front: string; // Word/term to learn

  @Column({ type: 'text', nullable: true })
  back: string; // Answer/meaning

  @Column({ nullable: true })
  pronunciation: string;

  @Column({ type: 'text', nullable: true })
  example: string;

  @Column({ type: 'text', nullable: true })
  exampleTranslation: string;

  @Column({ nullable: true })
  audioUrl: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ nullable: true })
  notes: string;

  @Column({ type: 'enum', enum: ['NEW', 'LEARNING', 'REVIEWING', 'MASTERED'], default: 'NEW' })
  status: 'NEW' | 'LEARNING' | 'REVIEWING' | 'MASTERED';

  @Column({ default: 1, type: 'smallint' })
  difficulty: number; // 1-5

  @Column({ default: 0 })
  viewCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => FlashcardDeck)
  @JoinColumn({ name: 'deckId' })
  deck: FlashcardDeck;

  @Column()
  deckId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  // Optional: Link to original vocabulary if auto-generated
  @Column({ nullable: true })
  sourceVocabularyId: string;

  @Column({ nullable: true })
  tags: string[]; // For categorization
}
```

**3. UserFlashcard** (`edu_user_flashcards`)
```typescript
@Entity('edu_user_flashcards')
export class UserFlashcard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: 2.5, type: 'decimal' })
  easeFactor: number; // SM-2 algorithm

  @Column({ default: 0 })
  interval: number; // Days until next review

  @Column({ default: 0 })
  repetitions: number; // Successful reviews

  @Column({ type: 'timestamp', nullable: true })
  nextReview: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastReviewed: Date;

  @Column({ default: 0 })
  correctCount: number;

  @Column({ default: 0 })
  wrongCount: number;

  @Column({ default: 0 })
  totalReviews: number;

  @Column({ type: 'timestamp', nullable: true })
  firstReviewed: Date;

  @Column({ default: 0 })
  streak: number; // Consecutive correct answers

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @ManyToOne(() => Flashcard)
  @JoinColumn({ name: 'flashcardId' })
  flashcard: Flashcard;

  @Column()
  flashcardId: string;

  @ManyToOne(() => FlashcardDeck)
  @JoinColumn({ name: 'deckId' })
  deck: FlashcardDeck;

  @Column()
  deckId: string;

  @UniqueConstraint(['userId', 'flashcardId'])
  @Index(['userId', 'flashcardId'])
  @Index(['userId', 'nextReview'])
}
```

**4. ReviewSession** (`edu_flashcard_review_sessions`)
```typescript
@Entity('edu_flashcard_review_sessions')
export class ReviewSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ['DAILY', 'DECK', 'CUSTOM'], default: 'DAILY' })
  type: 'DAILY' | 'DECK' | 'CUSTOM';

  @Column({ default: 0 })
  totalCards: number;

  @Column({ default: 0 })
  correctCards: number;

  @Column({ default: 0 })
  wrongCards: number;

  @Column({ default: 0 })
  skippedCards: number;

  @Column({ type: 'int', default: 0 })
  timeSpent: number; // Seconds

  @Column({ default: 0 })
  xpEarned: number;

  @Column({ type: 'json', nullable: true })
  results: ReviewResult[];

  @Column({ default: false })
  completed: boolean;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @ManyToOne(() => FlashcardDeck, { nullable: true })
  @JoinColumn({ name: 'deckId' })
  deck: FlashcardDeck;

  @Column({ nullable: true })
  deckId: string;

  @Index(['userId', 'startedAt'])
  @Index(['userId', 'completed'])
}
```

### Phase 2: DTOs Structure

**Flashcard Deck DTOs** (`flashcard-deck.dto.ts`)
```typescript
export class CreateFlashcardDeckDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}

export class UpdateFlashcardDeckDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
```

**Flashcard DTOs** (`flashcard.dto.ts`)
```typescript
export class CreateFlashcardDto {
  @IsString()
  @IsNotEmpty()
  front: string;

  @IsString()
  @IsNotEmpty()
  back: string;

  @IsString()
  @IsOptional()
  pronunciation?: string;

  @IsString()
  @IsOptional()
  example?: string;

  @IsString()
  @IsOptional()
  exampleTranslation?: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  audioUrl?: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  difficulty?: number;

  @IsString()
  @IsOptional()
  deckId?: string;

  @IsArray()
  @IsString()
  @IsOptional()
  tags?: string[];
}

export class BulkCreateFlashcardDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFlashcardDto)
  flashcards: CreateFlashcardDto[];

  @IsString()
  @IsOptional()
  deckId?: string;
}

export class UpdateFlashcardDto {
  @IsString()
  @IsOptional()
  front?: string;

  @IsString()
  @IsOptional()
  back?: string;

  @IsString()
  @IsOptional()
  pronunciation?: string;

  @IsString()
  @IsOptional()
  example?: string;

  @IsString()
  @IsOptional()
  exampleTranslation?: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  audioUrl?: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  difficulty?: number;

  @IsArray()
  @IsString()
  @IsOptional()
  tags?: string[];
}
```

**Review DTOs** (`flashcard-review.dto.ts`)
```typescript
export class ReviewFlashcardDto {
  @IsString()
  @IsNotEmpty()
  flashcardId: string;

  @IsNumber()
  @Min(0)
  @Max(5)
  @IsNotEmpty()
  quality: number; // 0=blackout, 1=forgot, 2=hard, 3=good, 4=easy, 5=perfect
}

export class StartReviewSessionDto {
  @IsString()
  @IsOptional()
  deckId?: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @IsEnum(['DAILY', 'DECK', 'CUSTOM'])
  @IsOptional()
  type?: 'DAILY' | 'DECK' | 'CUSTOM';
}

export class CompleteReviewSessionDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}
```

**Import DTOs** (`flashcard-import.dto.ts`)
```typescript
export class ImportFromVocabularyDto {
  @IsString()
  @IsNotEmpty()
  lessonId: string;

  @IsString()
  @IsOptional()
  deckId?: string; // If not provided, create new deck

  @IsBoolean()
  @IsOptional()
  createDeck?: boolean;
}

export class ImportFromVocabularyBulkDto {
  @IsArray()
  @IsString()
  lessonIds: string[];

  @IsString()
  @IsOptional()
  deckId?: string;
}
```

### Phase 3: Service Implementation

**FlashcardService** (`src/modules/education/flashcard.service.ts`)

**Key Methods:**

1. **Deck Management**
```typescript
async createDeck(userId: number, dto: CreateFlashcardDeckDto)
async getDecks(userId: number, page?: number, limit?: number)
async getDeckById(deckId: string, userId: number)
async updateDeck(deckId: string, userId: number, dto: UpdateFlashcardDeckDto)
async deleteDeck(deckId: string, userId: number)
async getPublicDecks(page?: number, limit?: number)
```

2. **Flashcard CRUD**
```typescript
async createFlashcard(userId: number, dto: CreateFlashcardDto)
async bulkCreateFlashcards(userId: number, dto: BulkCreateFlashcardDto)
async getFlashcards(userId: number, deckId?: string, page?: number, limit?: number)
async getFlashcardById(flashcardId: string, userId: number)
async updateFlashcard(flashcardId: string, userId: number, dto: UpdateFlashcardDto)
async deleteFlashcard(flashcardId: string, userId: number)
async searchFlashcards(userId: number, query: string, page?: number, limit?: number)
```

3. **Import from Vocabulary**
```typescript
async importFromVocabulary(userId: number, dto: ImportFromVocabularyDto)
async importFromVocabularyBulk(userId: number, dto: ImportFromVocabularyBulkDto)
private createFlashcardFromVocabulary(vocab: Vocabulary, deckId: string, userId: number)
private checkDuplicateFlashcard(front: string, userId: number): Promise<boolean>
```

4. **Review System**
```typescript
async startReviewSession(userId: number, dto: StartReviewSessionDto)
async reviewFlashcard(userId: number, dto: ReviewFlashcardDto)
async completeReviewSession(userId: number, dto: CompleteReviewSessionDto)
async getFlashcardsToReview(userId: number, deckId?: string, limit?: number)
private calculateSRS(userFlashcard: UserFlashcard, quality: number): void
```

5. **Statistics & Progress**
```typescript
async getFlashcardStats(userId: number)
async getDeckStats(userId: number, deckId: string)
async getReviewHistory(userId: number, page?: number, limit?: number)
async getDueFlashcardsCount(userId: number, deckId?: string)
```

**Deduplication Logic:**
```typescript
private async checkDuplicateFlashcard(front: string, userId: number): Promise<boolean> {
  const existing = await this.flashcardRepository.findOne({
    where: { front, userId },
  });
  return !!existing;
}

private async findExistingFlashcard(front: string, userId: number): Promise<Flashcard | null> {
  return this.flashcardRepository.findOne({
    where: { front, userId },
  });
}
```

### Phase 4: Controller Implementation

**FlashcardController** (`src/modules/education/flashcard.controller.ts`)

**Endpoints:**

**Deck Management:**
```typescript
POST   /flashcards/decks                    // Create deck
GET    /flashcards/decks                    // Get user's decks
GET    /flashcards/decks/public            // Get public decks
GET    /flashcards/decks/:id                // Get deck details
PATCH  /flashcards/decks/:id                // Update deck
DELETE /flashcards/decks/:id                // Delete deck
```

**Flashcard Management:**
```typescript
POST   /flashcards                          // Create flashcard
POST   /flashcards/bulk                     // Bulk create
GET    /flashcards                          // Get flashcards (with optional deck filter)
GET    /flashcards/:id                      // Get flashcard details
PATCH  /flashcards/:id                      // Update flashcard
DELETE /flashcards/:id                      // Delete flashcard
GET    /flashcards/search                   // Search flashcards
```

**Import from Vocabulary:**
```typescript
POST   /flashcards/import/vocabulary        // Import from lesson
POST   /flashcards/import/vocabulary/bulk   // Bulk import from lessons
```

**Review System:**
```typescript
POST   /flashcards/review/start             // Start review session
POST   /flashcards/review/:flashcardId       // Review single flashcard
POST   /flashcards/review/complete          // Complete session
GET    /flashcards/review/due              // Get due flashcards
GET    /flashcards/review/stats             // Get review statistics
```

**Statistics:**
```typescript
GET    /flashcards/stats                    // Overall stats
GET    /flashcards/decks/:id/stats          // Deck-specific stats
GET    /flashcards/history                 // Review history
```

### Phase 5: Module Integration

**Update EducationModule** (`src/modules/education/education.module.ts`)

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Existing entities...
      FlashcardDeck,
      Flashcard,
      UserFlashcard,
      ReviewSession,
    ]),
  ],
  controllers: [
    // Existing controllers...
    FlashcardController,
  ],
  providers: [
    // Existing services...
    FlashcardService,
  ],
  exports: [
    // Existing exports...
    FlashcardService,
  ],
})
export class EducationModule {}
```

**Update App Module** (`src/app.module.ts`)
```typescript
// Add to entities array in TypeOrmModule.forRootAsync
FlashcardDeck,
Flashcard,
UserFlashcard,
ReviewSession,
```

### Phase 6: Database Migrations

**Migration 1: Create Flashcard Tables**
```sql
CREATE TABLE edu_flashcard_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(255),
  color VARCHAR(7),
  card_count INTEGER DEFAULT 0,
  type VARCHAR(20) DEFAULT 'USER',
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_flashcard_decks_user ON edu_flashcard_decks(user_id);
CREATE INDEX idx_flashcard_decks_type ON edu_flashcard_decks(type);

CREATE TABLE edu_flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  front VARCHAR(500) NOT NULL,
  back TEXT,
  pronunciation VARCHAR(255),
  example TEXT,
  example_translation TEXT,
  audio_url VARCHAR(500),
  image_url VARCHAR(500),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'NEW',
  difficulty SMALLINT DEFAULT 1,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deck_id UUID NOT NULL,
  user_id INTEGER NOT NULL,
  source_vocabulary_id VARCHAR(255),
  tags TEXT[],
  FOREIGN KEY (deck_id) REFERENCES edu_flashcard_decks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_flashcards_deck ON edu_flashcards(deck_id);
CREATE INDEX idx_flashcards_user ON edu_flashcards(user_id);
CREATE INDEX idx_flashcards_front ON edu_flashcards(front);
CREATE INDEX idx_flashcards_status ON edu_flashcards(status);

CREATE TABLE edu_user_flashcards (
  id SERIAL PRIMARY KEY,
  ease_factor DECIMAL(3,2) DEFAULT 2.5,
  interval INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  next_review TIMESTAMP,
  last_reviewed TIMESTAMP,
  correct_count INTEGER DEFAULT 0,
  wrong_count INTEGER DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  first_reviewed TIMESTAMP,
  streak INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER NOT NULL,
  flashcard_id UUID NOT NULL,
  deck_id UUID NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (flashcard_id) REFERENCES edu_flashcards(id) ON DELETE CASCADE,
  FOREIGN KEY (deck_id) REFERENCES edu_flashcard_decks(id) ON DELETE CASCADE,
  UNIQUE (user_id, flashcard_id)
);

CREATE INDEX idx_user_flashcards_user_flashcard ON edu_user_flashcards(user_id, flashcard_id);
CREATE INDEX idx_user_flashcards_next_review ON edu_user_flashcards(user_id, next_review);

CREATE TABLE edu_flashcard_review_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) DEFAULT 'DAILY',
  total_cards INTEGER DEFAULT 0,
  correct_cards INTEGER DEFAULT 0,
  wrong_cards INTEGER DEFAULT 0,
  skipped_cards INTEGER DEFAULT 0,
  time_spent INTEGER DEFAULT 0,
  xp_earned INTEGER DEFAULT 0,
  results JSON,
  completed BOOLEAN DEFAULT false,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  user_id INTEGER NOT NULL,
  deck_id UUID,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (deck_id) REFERENCES edu_flashcard_decks(id) ON DELETE SET NULL
);

CREATE INDEX idx_review_sessions_user_started ON edu_flashcard_review_sessions(user_id, started_at);
CREATE INDEX idx_review_sessions_user_completed ON edu_flashcard_review_sessions(user_id, completed);
```

### Phase 7: Key Implementation Details

**SRS Algorithm Integration:**
Reuse existing SM-2 algorithm from `calculateSRS()` method in EducationService:
```typescript
private calculateSRS(userFlashcard: UserFlashcard, quality: number): void {
  const { easeFactor, interval, repetitions } = userFlashcard;

  if (quality >= 3) {
    // Correct answer
    if (repetitions === 0) {
      userFlashcard.interval = 1;
    } else if (repetitions === 1) {
      userFlashcard.interval = 6;
    } else {
      userFlashcard.interval = Math.round(interval * easeFactor);
    }
    userFlashcard.repetitions++;
  } else {
    // Wrong answer
    userFlashcard.repetitions = 0;
    userFlashcard.interval = 1;
  }

  // Update ease factor
  userFlashcard.easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  userFlashcard.easeFactor = Math.max(1.3, userFlashcard.easeFactor);

  // Calculate next review date
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + userFlashcard.interval);
  userFlashcard.nextReview = nextReview;
}
```

**Import from Vocabulary Logic:**
```typescript
async importFromVocabulary(userId: number, dto: ImportFromVocabularyDto) {
  const lesson = await this.getLessonById(dto.lessonId);
  const vocabularies = await this.vocabularyRepository.find({
    where: { lessonId: dto.lessonId },
  });

  let deckId = dto.deckId;

  // Create new deck if not provided
  if (!deckId) {
    const deck = this.flashcardDeckRepository.create({
      name: `${lesson.title} - Flashcards`,
      description: `Auto-generated from lesson: ${lesson.title}`,
      type: 'SYSTEM',
      userId,
      isPublic: false,
    });
    const savedDeck = await this.flashcardDeckRepository.save(deck);
    deckId = savedDeck.id;
  }

  let imported = 0;
  let skipped = 0;

  for (const vocab of vocabularies) {
    // Check for duplicates
    const duplicate = await this.checkDuplicateFlashcard(vocab.word, userId);
    if (duplicate) {
      skipped++;
      continue;
    }

    await this.createFlashcardFromVocabulary(vocab, deckId, userId);
    imported++;
  }

  // Update deck card count
  await this.flashcardDeckRepository.increment({ id: deckId }, 'cardCount', imported);

  return { imported, skipped, deckId };
}
```

**Review Session Flow:**
```typescript
async startReviewSession(userId: number, dto: StartReviewSessionDto) {
  const flashcards = await this.getFlashcardsToReview(userId, dto.deckId, dto.limit);

  const session = this.reviewSessionRepository.create({
    type: dto.type || 'DAILY',
    totalCards: flashcards.length,
    deckId: dto.deckId,
    userId,
    results: [],
  });

  return this.reviewSessionRepository.save(session);
}

async reviewFlashcard(userId: number, dto: ReviewFlashcardDto) {
  const userFlashcard = await this.userFlashcardRepository.findOne({
    where: { userId, flashcardId: dto.flashcardId },
  });

  if (!userFlashcard) {
    // First time reviewing this card
    const flashcard = await this.flashcardRepository.findOne({
      where: { id: dto.flashcardId },
    });

    userFlashcard = this.userFlashcardRepository.create({
      userId,
      flashcardId: dto.flashcardId,
      deckId: flashcard.deckId,
      firstReviewed: new Date(),
    });
  }

  // Update SRS
  this.calculateSRS(userFlashcard, dto.quality);

  // Update counts
  if (dto.quality >= 3) {
    userFlashcard.correctCount++;
    userFlashcard.streak++;
  } else {
    userFlashcard.wrongCount++;
    userFlashcard.streak = 0;
  }
  userFlashcard.totalReviews++;
  userFlashcard.lastReviewed = new Date();

  await this.userFlashcardRepository.save(userFlashcard);

  // Update flashcard status
  await this.updateFlashcardStatus(dto.flashcardId);

  // Update streak and XP
  await this.updateStreak(userId);

  return { success: true, nextReview: userFlashcard.nextReview };
}
```

### Phase 8: File Structure

```
src/modules/education/
├── entities/
│   ├── flashcard-deck.entity.ts
│   ├── flashcard.entity.ts
│   ├── user-flashcard.entity.ts
│   └── review-session.entity.ts
├── dto/
│   ├── flashcard-deck.dto.ts
│   ├── flashcard.dto.ts
│   ├── flashcard-review.dto.ts
│   └── flashcard-import.dto.ts
├── flashcard.controller.ts
├── flashcard.service.ts
└── education.module.ts (updated)
```

### Phase 9: Testing Strategy

**Unit Tests:**
- FlashcardService methods (CRUD, import, review)
- SRS algorithm calculations
- Deduplication logic
- Review session management

**Integration Tests:**
- API endpoints for all operations
- Database relationships and constraints
- Import from vocabulary functionality
- Review session flow

**E2E Tests:**
- Complete user flow: create deck → import cards → review session → check progress
- Deduplication scenarios
- Public deck sharing

### Phase 10: API Documentation

**Swagger Documentation:**
- Add comprehensive API documentation for all endpoints
- Include request/response examples
- Document error responses
- Add pagination parameters

**Example API Calls:**
```bash
# Create deck
POST /api/flashcards/decks
{
  "name": "Japanese Basics",
  "description": "Essential Japanese vocabulary",
  "icon": "🇯🇵",
  "color": "#FF5733"
}

# Import from vocabulary
POST /api/flashcards/import/vocabulary
{
  "lessonId": "lesson-uuid",
  "createDeck": true
}

# Start review session
POST /api/flashcards/review/start
{
  "deckId": "deck-uuid",
  "limit": 20,
  "type": "DAILY"
}

# Review flashcard
POST /api/flashcards/review/flashcard-uuid
{
  "quality": 4
}

# Get due flashcards
GET /api/flashcards/review/due?deckId=deck-uuid
```

## Critical Files to Modify

1. **src/modules/education/education.module.ts** - Add new entities and FlashcardService
2. **src/app.module.ts** - Add new entities to TypeORM configuration
3. **src/database/data-source.ts** - Add new entities to data source
4. **New files to create:**
   - All entity files in `src/modules/education/entities/`
   - All DTO files in `src/modules/education/dto/`
   - `src/modules/education/flashcard.controller.ts`
   - `src/modules/education/flashcard.service.ts`

## Verification Steps

1. **Database Setup:**
   - Run migration: `npm run migration:run`
   - Verify tables created: `edu_flashcard_decks`, `edu_flashcards`, `edu_user_flashcards`, `edu_flashcard_review_sessions`

2. **Build & Start:**
   - Build: `npm run build`
   - Start: `npm run start:dev`
   - Check for errors in console

3. **API Testing:**
   - Test deck CRUD operations
   - Test flashcard creation with deduplication
   - Test import from vocabulary
   - Test review session flow
   - Test statistics endpoints

4. **Integration Testing:**
   - Create deck → Import cards → Review cards → Check progress
   - Test deduplication by creating duplicate cards
   - Test SRS algorithm with different quality ratings
   - Verify streak and XP updates

5. **Swagger Documentation:**
   - Access Swagger UI: `http://localhost:3000/api`
   - Verify all endpoints documented
   - Test endpoints through Swagger UI

## Implementation Order

1. **Phase 1:** Create entity files and database migration
2. **Phase 2:** Create DTO files with validation
3. **Phase 3:** Implement FlashcardService with core methods
4. **Phase 4:** Implement FlashcardController with all endpoints
5. **Phase 5:** Update module configuration
6. **Phase 6:** Test and verify functionality
7. **Phase 7:** Add comprehensive documentation

## Success Criteria

- ✅ Users can create and manage flashcard decks
- ✅ Users can create flashcards manually with deduplication
- ✅ Users can import flashcards from existing vocabulary
- ✅ Review sessions work with SRS algorithm
- ✅ Statistics and progress tracking are accurate
- ✅ All API endpoints are documented and tested
- ✅ Build succeeds without errors
- ✅ Database migrations run successfully
