import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Emails were stored exactly as typed, so `A@x.com` and `a@x.com` were two
 * accounts and a user who typed a different case could not log in. New rows are
 * normalized in UsersService; this brings the existing ones along and adds the
 * expression index that makes the case-insensitive lookup cheap.
 */
export class NormalizeUserEmails1910000000004 implements MigrationInterface {
  name = 'NormalizeUserEmails1910000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rows that have a case-variant twin are skipped on purpose: lowering both
    // onto one address would break the unique constraint and abort the deploy.
    // They stay as they are and still resolve through the LOWER() lookup below.
    await queryRunner.query(`
      UPDATE "users" u
      SET "email" = lower(btrim(u."email"))
      WHERE u."email" <> lower(btrim(u."email"))
        AND NOT EXISTS (
          SELECT 1 FROM "users" o
          WHERE o."id" <> u."id"
            AND lower(btrim(o."email")) = lower(btrim(u."email"))
        )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_email_lower" ON "users" (LOWER("email"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_lower"`);
  }
}
