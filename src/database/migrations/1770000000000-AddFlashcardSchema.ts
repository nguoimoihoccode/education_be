import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFlashcardSchema1770000000000 implements MigrationInterface {
  name = 'AddFlashcardSchema1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'flashcard_deck_type_enum'
        ) THEN
          CREATE TYPE "public"."flashcard_deck_type_enum" AS ENUM(
            'SYSTEM',
            'USER'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'flashcard_status_enum'
        ) THEN
          CREATE TYPE "public"."flashcard_status_enum" AS ENUM(
            'NEW',
            'LEARNING',
            'REVIEWING',
            'MASTERED'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'review_session_type_enum'
        ) THEN
          CREATE TYPE "public"."review_session_type_enum" AS ENUM(
            'DAILY',
            'DECK',
            'CUSTOM'
          );
        END IF;
      END $$;
    `);

    // Create flashcard_decks table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "edu_flashcard_decks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "description" text,
        "icon" character varying(255),
        "color" character varying(7),
        "cardCount" integer NOT NULL DEFAULT 0,
        "type" "public"."flashcard_deck_type_enum" NOT NULL DEFAULT 'USER',
        "isPublic" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" integer NOT NULL,
        CONSTRAINT "PK_edu_flashcard_decks_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_edu_flashcard_decks_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_flashcard_decks_user"
      ON "edu_flashcard_decks" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_flashcard_decks_type"
      ON "edu_flashcard_decks" ("type")
    `);

    // Create flashcards table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "edu_flashcards" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "front" character varying(500) NOT NULL,
        "back" text,
        "pronunciation" character varying(255),
        "example" text,
        "exampleTranslation" text,
        "audioUrl" character varying(500),
        "imageUrl" character varying(500),
        "notes" text,
        "status" "public"."flashcard_status_enum" NOT NULL DEFAULT 'NEW',
        "difficulty" smallint NOT NULL DEFAULT 1,
        "viewCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deckId" uuid NOT NULL,
        "userId" integer NOT NULL,
        "sourceVocabularyId" character varying(255),
        "tags" text,
        CONSTRAINT "PK_edu_flashcards_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_edu_flashcards_deck" FOREIGN KEY ("deckId") REFERENCES "edu_flashcard_decks"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_edu_flashcards_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_flashcards_deck"
      ON "edu_flashcards" ("deckId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_flashcards_user"
      ON "edu_flashcards" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_flashcards_front"
      ON "edu_flashcards" ("front")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_flashcards_status"
      ON "edu_flashcards" ("status")
    `);

    // Create user_flashcards table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "edu_user_flashcards" (
        "id" SERIAL NOT NULL,
        "easeFactor" numeric(3,2) NOT NULL DEFAULT 2.5,
        "interval" integer NOT NULL DEFAULT 0,
        "repetitions" integer NOT NULL DEFAULT 0,
        "nextReview" TIMESTAMP,
        "lastReviewed" TIMESTAMP,
        "correctCount" integer NOT NULL DEFAULT 0,
        "wrongCount" integer NOT NULL DEFAULT 0,
        "totalReviews" integer NOT NULL DEFAULT 0,
        "firstReviewed" TIMESTAMP,
        "streak" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" integer NOT NULL,
        "flashcardId" uuid NOT NULL,
        "deckId" uuid NOT NULL,
        CONSTRAINT "PK_edu_user_flashcards_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_edu_user_flashcards_user_flashcard" UNIQUE ("userId", "flashcardId"),
        CONSTRAINT "FK_edu_user_flashcards_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_edu_user_flashcards_flashcard" FOREIGN KEY ("flashcardId") REFERENCES "edu_flashcards"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_edu_user_flashcards_deck" FOREIGN KEY ("deckId") REFERENCES "edu_flashcard_decks"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_user_flashcards_user_flashcard"
      ON "edu_user_flashcards" ("userId", "flashcardId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_user_flashcards_next_review"
      ON "edu_user_flashcards" ("userId", "nextReview")
    `);

    // Create review_sessions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "edu_flashcard_review_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" "public"."review_session_type_enum" NOT NULL DEFAULT 'DAILY',
        "totalCards" integer NOT NULL DEFAULT 0,
        "correctCards" integer NOT NULL DEFAULT 0,
        "wrongCards" integer NOT NULL DEFAULT 0,
        "skippedCards" integer NOT NULL DEFAULT 0,
        "timeSpent" integer NOT NULL DEFAULT 0,
        "xpEarned" integer NOT NULL DEFAULT 0,
        "results" json,
        "completed" boolean NOT NULL DEFAULT false,
        "startedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "completedAt" TIMESTAMP,
        "userId" integer NOT NULL,
        "deckId" uuid,
        CONSTRAINT "PK_edu_flashcard_review_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_edu_flashcard_review_sessions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_edu_flashcard_review_sessions_deck" FOREIGN KEY ("deckId") REFERENCES "edu_flashcard_decks"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_flashcard_review_sessions_user_started"
      ON "edu_flashcard_review_sessions" ("userId", "startedAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_flashcard_review_sessions_user_completed"
      ON "edu_flashcard_review_sessions" ("userId", "completed")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop review_sessions table
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_flashcard_review_sessions_user_completed"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_flashcard_review_sessions_user_started"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "edu_flashcard_review_sessions"
    `);

    // Drop user_flashcards table
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_user_flashcards_next_review"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_user_flashcards_user_flashcard"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "edu_user_flashcards"
    `);

    // Drop flashcards table
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_flashcards_status"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_flashcards_front"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_flashcards_user"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_flashcards_deck"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "edu_flashcards"
    `);

    // Drop flashcard_decks table
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_flashcard_decks_type"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_flashcard_decks_user"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "edu_flashcard_decks"
    `);

    // Drop enum types
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."review_session_type_enum"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."flashcard_status_enum"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."flashcard_deck_type_enum"
    `);
  }
}
