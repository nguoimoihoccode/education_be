import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthLoginAttempts1830000000000 implements MigrationInterface {
  name = 'AddAuthLoginAttempts1830000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_login_attempts" (
        "id" SERIAL NOT NULL,
        "identifier" character varying NOT NULL,
        "ip_address" character varying NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "locked_until" TIMESTAMP,
        "last_attempt_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_login_attempts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_auth_login_attempts_identifier_ip" UNIQUE ("identifier", "ip_address")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_auth_login_attempts_identifier" ON "auth_login_attempts" ("identifier")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_auth_login_attempts_ip_address" ON "auth_login_attempts" ("ip_address")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auth_login_attempts"`);
  }
}
