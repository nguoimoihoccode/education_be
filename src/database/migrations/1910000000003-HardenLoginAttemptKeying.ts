import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The login lockout used to be keyed on (identifier, ip_address), which made
 * the counter worthless: a caller that rotates its address -- trivially, via
 * X-Forwarded-For -- starts a new bucket on every request, and an attack spread
 * over many addresses never adds up. The key becomes the identifier alone; the
 * address column stays as informational context for reviewing a lockout.
 */
export class HardenLoginAttemptKeying1910000000003 implements MigrationInterface {
  name = 'HardenLoginAttemptKeying1910000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Narrowing the key needs one row per identifier first. Keep the row with
    // the most attempts -- the strongest evidence of abuse -- and drop the rest.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT "id", ROW_NUMBER() OVER (
          PARTITION BY "identifier"
          ORDER BY "attempts" DESC, "last_attempt_at" DESC, "id" DESC
        ) AS rn
        FROM "auth_login_attempts"
      )
      DELETE FROM "auth_login_attempts" a
      USING ranked r
      WHERE a."id" = r."id" AND r.rn > 1
    `);
    await queryRunner.query(
      `ALTER TABLE "auth_login_attempts" DROP CONSTRAINT IF EXISTS "UQ_auth_login_attempts_identifier_ip"`,
    );
    // The plain index was the second half of the old lookup; the unique index
    // below indexes the identifier on its own.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_auth_login_attempts_identifier"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_auth_login_attempts_identifier" ON "auth_login_attempts" ("identifier")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_auth_login_attempts_identifier"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_login_attempts_identifier" ON "auth_login_attempts" ("identifier")`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_login_attempts" ADD CONSTRAINT "UQ_auth_login_attempts_identifier_ip" UNIQUE ("identifier", "ip_address")`,
    );
  }
}
