import { MigrationInterface, QueryRunner } from 'typeorm';

/** Token and cost accounting for every AI chat completion, plus admin pricing. */
export class AddAiUsageLogs1930000000000 implements MigrationInterface {
  name = 'AddAiUsageLogs1930000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "ai_usage_logs" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" integer NULL,
      "feature" varchar(32) NOT NULL,
      "model" varchar(128) NOT NULL,
      "provider_host" varchar(255) NOT NULL,
      "status" varchar(16) NOT NULL,
      "prompt_tokens" integer NULL CHECK ("prompt_tokens" >= 0),
      "completion_tokens" integer NULL CHECK ("completion_tokens" >= 0),
      "total_tokens" integer NULL CHECK ("total_tokens" >= 0),
      "cost_micros" bigint NULL CHECK ("cost_micros" >= 0),
      "latency_ms" integer NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_ai_usage_logs" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_ai_usage_logs_status" CHECK ("status" IN ('ok','error'))
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_ai_usage_logs_created_at" ON "ai_usage_logs" ("created_at")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_ai_usage_logs_user_created" ON "ai_usage_logs" ("user_id","created_at")',
    );
    await queryRunner.query(
      'ALTER TABLE "ai_provider_settings" ADD "input_price_usd_per_million" double precision NULL, ADD "output_price_usd_per_million" double precision NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "ai_provider_settings" DROP COLUMN "output_price_usd_per_million", DROP COLUMN "input_price_usd_per_million"',
    );
    await queryRunner.query('DROP TABLE "ai_usage_logs"');
  }
}
