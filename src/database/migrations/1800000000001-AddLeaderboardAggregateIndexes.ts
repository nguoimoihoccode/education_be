import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeaderboardAggregateIndexes1800000000001 implements MigrationInterface {
  name = 'AddLeaderboardAggregateIndexes1800000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_edu_user_lessons_completed_at_user"
      ON "edu_user_lessons" ("completed_at", "user_id")
      WHERE "completed" = true
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_edu_quiz_sessions_completed_at_user"
      ON "edu_quiz_sessions" ("completedAt", "userId")
      WHERE "completed" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_quiz_sessions_completed_at_user"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_edu_user_lessons_completed_at_user"
    `);
  }
}
