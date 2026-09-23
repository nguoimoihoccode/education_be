import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The retrieval distance log (RAG plan gap #7): one row per vector search, so
 * `MAX_COSINE_DISTANCE` can be tuned from measured traffic instead of a guess.
 *
 * Plain SQL only — no pgvector dependency — so it applies on any Postgres this
 * project runs, including a local 14.x without the extension.
 */
export class AddAiRetrievalLogs1900000000000 implements MigrationInterface {
  name = 'AddAiRetrievalLogs1900000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_retrieval_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "conversation_id" uuid,
        "lesson_id" uuid,
        "query_preview" character varying(300) NOT NULL,
        "candidate_count" integer NOT NULL,
        "hit_count" integer NOT NULL,
        "best_distance" real,
        "distances" jsonb NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_retrieval_logs_id" PRIMARY KEY ("id")
      )
    `);

    // The only lookups are time-windowed aggregations (the stats endpoint) and
    // the retention delete; both scan by created_at.
    await queryRunner.query(`
      CREATE INDEX "IDX_ai_retrieval_logs_created_at"
      ON "ai_retrieval_logs" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_retrieval_logs"`);
  }
}
