import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuizSchema1770000000002 implements MigrationInterface {
  name = 'AddQuizSchema1770000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'quiz_question_type_enum'
        ) THEN
          CREATE TYPE "public"."quiz_question_type_enum" AS ENUM(
            'MULTIPLE_CHOICE',
            'TRUE_FALSE',
            'FILL_BLANK',
            'MIXED'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'quiz_difficulty_enum'
        ) THEN
          CREATE TYPE "public"."quiz_difficulty_enum" AS ENUM(
            'EASY',
            'MEDIUM',
            'HARD',
            'MIXED'
          );
        END IF;
      END $$;
    `);

    // Create quizzes table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "edu_quizzes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "description" text,
        "topic" character varying(100),
        "questionType" "public"."quiz_question_type_enum" NOT NULL DEFAULT 'MIXED',
        "questionCount" integer NOT NULL DEFAULT 10,
        "timeLimit" integer NOT NULL DEFAULT 60,
        "passingScore" integer NOT NULL DEFAULT 0,
        "difficulty" "public"."quiz_difficulty_enum" NOT NULL DEFAULT 'MIXED',
        "isPublic" boolean NOT NULL DEFAULT true,
        "shuffleQuestions" boolean NOT NULL DEFAULT true,
        "shuffleAnswers" boolean NOT NULL DEFAULT true,
        "showCorrectAnswer" boolean NOT NULL DEFAULT false,
        "allowRetry" boolean NOT NULL DEFAULT false,
        "maxRetries" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" integer NOT NULL,
        CONSTRAINT "PK_edu_quizzes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_edu_quizzes_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_quizzes_user"
      ON "edu_quizzes" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_quizzes_topic"
      ON "edu_quizzes" ("topic")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_quizzes_type"
      ON "edu_quizzes" ("questionType")
    `);

    // Create quiz_questions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "edu_quiz_questions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "question" text NOT NULL,
        "type" "public"."quiz_question_type_enum" NOT NULL,
        "options" json,
        "correctAnswer" character varying(500) NOT NULL,
        "explanation" text,
        "points" integer NOT NULL DEFAULT 1,
        "order" integer NOT NULL DEFAULT 0,
        "flashcardId" character varying(255),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "quizId" uuid NOT NULL,
        CONSTRAINT "PK_edu_quiz_questions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_edu_quiz_questions_quiz" FOREIGN KEY ("quizId") REFERENCES "edu_quizzes"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_quiz_questions_quiz"
      ON "edu_quiz_questions" ("quizId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_quiz_questions_type"
      ON "edu_quiz_questions" ("type")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_quiz_questions_flashcard"
      ON "edu_quiz_questions" ("flashcardId")
    `);

    // Create quiz_sessions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "edu_quiz_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "score" integer NOT NULL DEFAULT 0,
        "totalPoints" integer NOT NULL DEFAULT 0,
        "earnedPoints" integer NOT NULL DEFAULT 0,
        "correctAnswers" integer NOT NULL DEFAULT 0,
        "wrongAnswers" integer NOT NULL DEFAULT 0,
        "skippedAnswers" integer NOT NULL DEFAULT 0,
        "timeSpent" integer NOT NULL DEFAULT 0,
        "passed" boolean NOT NULL DEFAULT false,
        "completed" boolean NOT NULL DEFAULT false,
        "startedAt" TIMESTAMP DEFAULT now(),
        "completedAt" TIMESTAMP,
        "answers" json,
        "attemptNumber" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" integer NOT NULL,
        "quizId" uuid NOT NULL,
        CONSTRAINT "PK_edu_quiz_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_edu_quiz_sessions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_edu_quiz_sessions_quiz" FOREIGN KEY ("quizId") REFERENCES "edu_quizzes"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_quiz_sessions_user_quiz"
      ON "edu_quiz_sessions" ("userId", "quizId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_quiz_sessions_user_started"
      ON "edu_quiz_sessions" ("userId", "startedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop quiz_sessions table
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_quiz_sessions_user_started"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_quiz_sessions_user_quiz"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "edu_quiz_sessions"
    `);

    // Drop quiz_questions table
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_quiz_questions_flashcard"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_quiz_questions_type"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_quiz_questions_quiz"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "edu_quiz_questions"
    `);

    // Drop quizzes table
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_quizzes_type"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_quizzes_topic"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_quizzes_user"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "edu_quizzes"
    `);

    // Drop enum types
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."quiz_difficulty_enum"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."quiz_question_type_enum"
    `);
  }
}
