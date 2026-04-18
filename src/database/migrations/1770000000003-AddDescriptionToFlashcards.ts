import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescriptionToFlashcards1770000000003
  implements MigrationInterface
{
  name = 'AddDescriptionToFlashcards1770000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "edu_flashcards"
      ADD COLUMN IF NOT EXISTS "description" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "edu_flashcards"
      DROP COLUMN IF EXISTS "description"
    `);
  }
}
