import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTopicToFlashcardDecks1770000000001 implements MigrationInterface {
  name = 'AddTopicToFlashcardDecks1770000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "edu_flashcard_decks"
      ADD COLUMN IF NOT EXISTS "topic" character varying(100)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_flashcard_decks_topic"
      ON "edu_flashcard_decks" ("topic")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_flashcard_decks_topic"
    `);

    await queryRunner.query(`
      ALTER TABLE "edu_flashcard_decks"
      DROP COLUMN IF EXISTS "topic"
    `);
  }
}
