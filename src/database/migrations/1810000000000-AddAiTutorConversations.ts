import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiTutorConversations1810000000000 implements MigrationInterface {
  name = 'AddAiTutorConversations1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TYPE "public"."ai_message_role_enum" AS ENUM('user', 'assistant')
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_conversations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" integer NOT NULL,
        "title" character varying(120) NOT NULL DEFAULT 'New Chat',
        "lesson_id" character varying(64),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_conversations_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_conversations_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_conversations_user_updated"
      ON "ai_conversations" ("user_id", "updated_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "conversation_id" uuid NOT NULL,
        "role" "public"."ai_message_role_enum" NOT NULL,
        "content" text NOT NULL,
        "token_count" integer,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_messages_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_messages_conversation"
          FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_messages_conversation_created"
      ON "ai_messages" ("conversation_id", "created_at" ASC)
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_provider_settings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "base_url" character varying(512),
        "api_key_encrypted" text,
        "api_key_last4" character varying(4),
        "model" character varying(128),
        "max_tokens" integer,
        "temperature" double precision,
        "updated_by_user_id" integer,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_provider_settings_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_provider_settings_updated_by"
          FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_provider_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_conversations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."ai_message_role_enum"`);
  }
}
