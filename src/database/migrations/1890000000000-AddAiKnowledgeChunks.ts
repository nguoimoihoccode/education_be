import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The retrieval corpus for the AI tutor (RAG tier B) plus its provider settings.
 *
 * `CREATE EXTENSION vector` needs an image that ships pgvector — see
 * `docker/postgres/Dockerfile`. An apk package cannot substitute: the official
 * image compiles Postgres with `--prefix=/usr/local`, while Alpine's
 * `postgresql-pgvector` installs into /usr for Alpine's own postgresql16, so the
 * server would never find it.
 */
export class AddAiKnowledgeChunks1890000000000 implements MigrationInterface {
  name = 'AddAiKnowledgeChunks1890000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "vector"`);

    await queryRunner.query(`
      CREATE TYPE "public"."ai_knowledge_source_type_enum" AS ENUM('lesson', 'vocabulary')
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_knowledge_chunks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "source_type" "public"."ai_knowledge_source_type_enum" NOT NULL,
        "lesson_id" uuid NOT NULL,
        "course_id" uuid,
        "chunk_index" integer NOT NULL,
        "title" character varying(512) NOT NULL,
        "content" text NOT NULL,
        "content_hash" character varying(64) NOT NULL,
        "embedding" vector(1536),
        "embedded_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_knowledge_chunks_id" PRIMARY KEY ("id")
      )
    `);

    // Deliberately no foreign key to edu_lessons, matching
    // ai_conversations.lesson_id: a lesson delete must never fail on the index.
    // Chunks left behind are removed by the reindex sweep instead.
    //
    // The width is fixed by the embedding model (text-embedding-3-small → 1536).
    // Switching to a different width is not a config change: the column must be
    // altered and the whole corpus re-embedded, which is why ai_embedding_settings
    // records the width it was configured with.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ai_knowledge_chunks_source"
      ON "ai_knowledge_chunks" ("source_type", "lesson_id", "chunk_index")
    `);

    // Approximate nearest-neighbour index over cosine distance, matching the
    // `<=>` operator the retrieval query orders by. Without it every search is a
    // sequential scan over the whole corpus.
    await queryRunner.query(`
      CREATE INDEX "IDX_ai_knowledge_chunks_embedding"
      ON "ai_knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_knowledge_chunks_lesson"
      ON "ai_knowledge_chunks" ("lesson_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_knowledge_chunks_course"
      ON "ai_knowledge_chunks" ("course_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_embedding_settings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "base_url" character varying(512),
        "api_key_encrypted" text,
        "api_key_last4" character varying(4),
        "model" character varying(128),
        "dimensions" integer,
        "updated_by_user_id" integer,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_embedding_settings_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_embedding_settings_updated_by"
          FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_embedding_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_knowledge_chunks"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."ai_knowledge_source_type_enum"`,
    );
    // The extension is left in place: dropping it would fail while any other
    // table still uses a vector column, and re-creating it is not a cost worth
    // taking on during a revert.
  }
}
