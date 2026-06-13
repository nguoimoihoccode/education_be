import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEducationPlatformApis1800000000000 implements MigrationInterface {
  name = 'AddEducationPlatformApis1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto"
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."edu_social_post_type_enum" AS ENUM(
        'achievement',
        'question',
        'share',
        'milestone'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."edu_activity_type_enum" AS ENUM(
        'system',
        'learning',
        'practice',
        'social',
        'achievement'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."edu_export_format_enum" AS ENUM(
        'json',
        'csv'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."edu_export_time_range_enum" AS ENUM(
        'all',
        '30days',
        'yeartodate'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."edu_export_status_enum" AS ENUM(
        'completed',
        'failed'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "edu_social_posts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "author_id" integer NOT NULL,
        "content" text NOT NULL,
        "image_url" character varying,
        "type" "public"."edu_social_post_type_enum" NOT NULL,
        "tags" text[] NOT NULL DEFAULT '{}',
        "shares_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_edu_social_posts_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_edu_social_posts_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_edu_social_posts_author"
      ON "edu_social_posts" ("author_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_edu_social_posts_created"
      ON "edu_social_posts" ("created_at" DESC, "id" ASC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_edu_social_posts_type_created"
      ON "edu_social_posts" ("type", "created_at" DESC, "id" ASC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_edu_social_posts_tags"
      ON "edu_social_posts" USING GIN ("tags")
    `);

    await queryRunner.query(`
      CREATE TABLE "edu_social_comments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "post_id" uuid NOT NULL,
        "author_id" integer NOT NULL,
        "content" text NOT NULL,
        "likes_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_edu_social_comments_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_edu_social_comments_post" FOREIGN KEY ("post_id") REFERENCES "edu_social_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_edu_social_comments_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_edu_social_comments_post_created"
      ON "edu_social_comments" ("post_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_edu_social_comments_author"
      ON "edu_social_comments" ("author_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "edu_social_post_likes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "post_id" uuid NOT NULL,
        "user_id" integer NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_edu_social_post_likes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_edu_social_post_likes_post_user" UNIQUE ("post_id", "user_id"),
        CONSTRAINT "FK_edu_social_post_likes_post" FOREIGN KEY ("post_id") REFERENCES "edu_social_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_edu_social_post_likes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_edu_social_post_likes_user"
      ON "edu_social_post_likes" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "edu_social_post_bookmarks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "post_id" uuid NOT NULL,
        "user_id" integer NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_edu_social_post_bookmarks_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_edu_social_post_bookmarks_post_user" UNIQUE ("post_id", "user_id"),
        CONSTRAINT "FK_edu_social_post_bookmarks_post" FOREIGN KEY ("post_id") REFERENCES "edu_social_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_edu_social_post_bookmarks_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_edu_social_post_bookmarks_user"
      ON "edu_social_post_bookmarks" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "edu_activity_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" integer NOT NULL,
        "type" "public"."edu_activity_type_enum" NOT NULL,
        "action" character varying(100) NOT NULL,
        "detail" text NOT NULL,
        "xp" integer NOT NULL DEFAULT 0,
        "metadata" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_edu_activity_logs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_edu_activity_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_edu_activity_logs_user_created"
      ON "edu_activity_logs" ("user_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_edu_activity_logs_type"
      ON "edu_activity_logs" ("type")
    `);

    await queryRunner.query(`
      CREATE TABLE "edu_data_exports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" integer NOT NULL,
        "format" "public"."edu_export_format_enum" NOT NULL,
        "time_range" "public"."edu_export_time_range_enum" NOT NULL,
        "data_types" jsonb NOT NULL,
        "status" "public"."edu_export_status_enum" NOT NULL,
        "file_name" character varying NOT NULL,
        "file_path" character varying NOT NULL,
        "file_size" bigint NOT NULL DEFAULT 0,
        "error_message" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_edu_data_exports_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_edu_data_exports_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_edu_data_exports_user_created"
      ON "edu_data_exports" ("user_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "edu_data_exports"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "edu_activity_logs"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "edu_social_post_bookmarks"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "edu_social_post_likes"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "edu_social_comments"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "edu_social_posts"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."edu_export_status_enum"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."edu_export_time_range_enum"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."edu_export_format_enum"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."edu_activity_type_enum"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."edu_social_post_type_enum"
    `);
  }
}
