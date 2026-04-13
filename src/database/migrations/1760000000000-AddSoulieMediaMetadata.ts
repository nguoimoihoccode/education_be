import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoulieMediaMetadata1760000000000 implements MigrationInterface {
  name = 'AddSoulieMediaMetadata1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "soulie_moments"
      ADD COLUMN IF NOT EXISTS "thumbnail_url" character varying,
      ADD COLUMN IF NOT EXISTS "image_width" integer,
      ADD COLUMN IF NOT EXISTS "image_height" integer,
      ADD COLUMN IF NOT EXISTS "mime_type" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "soulie_messages"
      ADD COLUMN IF NOT EXISTS "thumbnail_url" character varying,
      ADD COLUMN IF NOT EXISTS "media_width" integer,
      ADD COLUMN IF NOT EXISTS "media_height" integer,
      ADD COLUMN IF NOT EXISTS "mime_type" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "soulie_messages"
      DROP COLUMN IF EXISTS "mime_type",
      DROP COLUMN IF EXISTS "media_height",
      DROP COLUMN IF EXISTS "media_width",
      DROP COLUMN IF EXISTS "thumbnail_url"
    `);

    await queryRunner.query(`
      ALTER TABLE "soulie_moments"
      DROP COLUMN IF EXISTS "mime_type",
      DROP COLUMN IF EXISTS "image_height",
      DROP COLUMN IF EXISTS "image_width",
      DROP COLUMN IF EXISTS "thumbnail_url"
    `);
  }
}
