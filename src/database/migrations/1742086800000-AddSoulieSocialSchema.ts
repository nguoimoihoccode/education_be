import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoulieSocialSchema1742086800000 implements MigrationInterface {
  name = 'AddSoulieSocialSchema1742086800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "username" character varying(50)
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_username_unique"
      ON "users" ("username")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'soulie_friendship_status_enum'
        ) THEN
          CREATE TYPE "public"."soulie_friendship_status_enum" AS ENUM(
            'pending',
            'accepted',
            'rejected',
            'blocked'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'soulie_message_type_enum'
        ) THEN
          CREATE TYPE "public"."soulie_message_type_enum" AS ENUM(
            'text',
            'photo',
            'reaction'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "soulie_friendships" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "requester_id" integer NOT NULL,
        "addressee_id" integer NOT NULL,
        "status" "public"."soulie_friendship_status_enum" NOT NULL DEFAULT 'pending',
        "responded_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_soulie_friendships_requester_addressee" UNIQUE ("requester_id", "addressee_id"),
        CONSTRAINT "PK_soulie_friendships_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_soulie_friendships_requester" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_soulie_friendships_addressee" FOREIGN KEY ("addressee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soulie_friendships_requester_id"
      ON "soulie_friendships" ("requester_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soulie_friendships_addressee_id"
      ON "soulie_friendships" ("addressee_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soulie_friendships_status"
      ON "soulie_friendships" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "soulie_conversations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "participant_one_id" integer NOT NULL,
        "participant_two_id" integer NOT NULL,
        "last_message_text" text,
        "last_message_type" "public"."soulie_message_type_enum",
        "last_message_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_soulie_conversations_participants" UNIQUE ("participant_one_id", "participant_two_id"),
        CONSTRAINT "PK_soulie_conversations_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_soulie_conversations_participant_one" FOREIGN KEY ("participant_one_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_soulie_conversations_participant_two" FOREIGN KEY ("participant_two_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soulie_conversations_participant_one"
      ON "soulie_conversations" ("participant_one_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soulie_conversations_participant_two"
      ON "soulie_conversations" ("participant_two_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soulie_conversations_last_message_at"
      ON "soulie_conversations" ("last_message_at")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "soulie_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversation_id" uuid NOT NULL,
        "sender_id" integer NOT NULL,
        "type" "public"."soulie_message_type_enum" NOT NULL DEFAULT 'text',
        "text" text,
        "media_url" character varying,
        "seen_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_soulie_messages_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_soulie_messages_conversation" FOREIGN KEY ("conversation_id") REFERENCES "soulie_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_soulie_messages_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soulie_messages_conversation_created_at"
      ON "soulie_messages" ("conversation_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soulie_messages_sender_id"
      ON "soulie_messages" ("sender_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "soulie_moments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sender_id" integer NOT NULL,
        "recipient_id" integer NOT NULL,
        "caption" text,
        "image_url" character varying,
        "opened_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_soulie_moments_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_soulie_moments_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_soulie_moments_recipient" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soulie_moments_sender_id"
      ON "soulie_moments" ("sender_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soulie_moments_recipient_id"
      ON "soulie_moments" ("recipient_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_soulie_moments_created_at"
      ON "soulie_moments" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_soulie_moments_created_at"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_soulie_moments_recipient_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_soulie_moments_sender_id"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "soulie_moments"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_soulie_messages_sender_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_soulie_messages_conversation_created_at"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "soulie_messages"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_soulie_conversations_last_message_at"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_soulie_conversations_participant_two"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_soulie_conversations_participant_one"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "soulie_conversations"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_soulie_friendships_status"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_soulie_friendships_addressee_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_soulie_friendships_requester_id"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "soulie_friendships"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_username_unique"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "last_seen_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "username"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."soulie_message_type_enum"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."soulie_friendship_status_enum"
    `);
  }
}
