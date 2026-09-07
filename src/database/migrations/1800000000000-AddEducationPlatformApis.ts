import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEducationPlatformApis1800000000000 implements MigrationInterface {
  name = 'AddEducationPlatformApis1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto"
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
  }
}
