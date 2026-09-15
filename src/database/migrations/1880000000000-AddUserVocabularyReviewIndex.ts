import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserVocabularyReviewIndex1880000000000 implements MigrationInterface {
  name = 'AddUserVocabularyReviewIndex1880000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // SRS review lookups filter by user + due date and sort by next_review;
    // without this index the query scans every vocabulary row of the user.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edu_user_vocabularies_user_next_review"
      ON "edu_user_vocabularies" ("user_id", "next_review")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_user_vocabularies_user_next_review"
    `);
  }
}
