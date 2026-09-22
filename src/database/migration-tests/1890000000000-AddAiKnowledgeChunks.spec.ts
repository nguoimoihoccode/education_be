import { getMetadataArgsStorage } from 'typeorm';
import { AiEmbeddingSettings } from '../../modules/ai/entities/ai-embedding-settings.entity';
import { AiKnowledgeChunk } from '../../modules/ai/entities/ai-knowledge-chunk.entity';
import { DEFAULT_EMBEDDING_DIMENSIONS } from '../../modules/ai/embedding.service';
import { AddAiKnowledgeChunks1890000000000 } from '../migrations/1890000000000-AddAiKnowledgeChunks';

describe('AddAiKnowledgeChunks1890000000000', () => {
  const createQueryRunner = () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, ' ').trim());
      }),
    };

    return { queries, queryRunner };
  };

  const runUp = async () => {
    const { queries, queryRunner } = createQueryRunner();
    await new AddAiKnowledgeChunks1890000000000().up(queryRunner as never);
    return queries;
  };

  const runDown = async () => {
    const { queries, queryRunner } = createQueryRunner();
    await new AddAiKnowledgeChunks1890000000000().down(queryRunner as never);
    return queries;
  };

  it('runs the extension first, since every statement after it depends on it', async () => {
    const queries = await runUp();

    // The extension has to come first, and its own column type is only resolved
    // when the CREATE TABLE runs — on an image without pgvector this fails right
    // here, which is the loudest possible way to notice the wrong DB image.
    expect(queries[0]).toBe('CREATE EXTENSION IF NOT EXISTS "vector"');
    expect(queries[1]).toContain(
      `CREATE TYPE "public"."ai_knowledge_source_type_enum" AS ENUM('lesson', 'vocabulary')`,
    );
    expect(queries[2]).toContain('CREATE TABLE "ai_knowledge_chunks"');
  });

  it('gives the vector column the width the embedding service defaults to', async () => {
    const queries = await runUp();
    const chunksTable = queries.find((sql) =>
      sql.startsWith('CREATE TABLE "ai_knowledge_chunks"'),
    );

    // The width is not free to drift: `embedding.service` rejects a provider that
    // returns a different length at runtime, and the column would reject the
    // insert anyway. Pinning it here means changing one without the other fails
    // in CI rather than on the first reindex against a real provider.
    expect(chunksTable).toContain(
      `"embedding" vector(${DEFAULT_EMBEDDING_DIMENSIONS}),`,
    );
  });

  it('keeps the chunk row keyed by source and lesson, not by a foreign key', async () => {
    const queries = await runUp();
    const chunksTable = queries.find((sql) =>
      sql.startsWith('CREATE TABLE "ai_knowledge_chunks"'),
    );

    // No FK to edu_lessons, matching ai_conversations.lesson_id: deleting a
    // lesson must never fail because an index row still points at it. The
    // reconciling reindex removes orphaned chunks instead.
    expect(chunksTable).not.toContain('REFERENCES "edu_lessons"');
    expect(chunksTable).toContain('"lesson_id" uuid NOT NULL');
    expect(chunksTable).toContain(
      '"content_hash" character varying(64) NOT NULL',
    );
    expect(chunksTable).toContain('"embedded_at" TIMESTAMPTZ');

    expect(queries).toContain(
      `CREATE UNIQUE INDEX "UQ_ai_knowledge_chunks_source" ON "ai_knowledge_chunks" ("source_type", "lesson_id", "chunk_index")`,
    );
  });

  it('indexes the embeddings for cosine distance, which the entity cannot express', async () => {
    const queries = await runUp();

    // HNSW with vector_cosine_ops matches the `<=>` operator the retrieval query
    // orders by; an index built for another operator would silently not be used.
    // TypeORM has no `vector` index type or operator class, so this index exists
    // only here — there is deliberately no matching @Index on the entity.
    expect(queries).toContain(
      `CREATE INDEX "IDX_ai_knowledge_chunks_embedding" ON "ai_knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops)`,
    );

    const metadata = getMetadataArgsStorage();
    const hnsw = metadata.indices.find(
      (candidate) =>
        candidate.target === AiKnowledgeChunk &&
        candidate.name === 'IDX_ai_knowledge_chunks_embedding',
    );
    expect(hnsw).toBeUndefined();
  });

  it('creates filter indexes for the two lookups the services actually do', async () => {
    const queries = await runUp();

    expect(queries).toContain(
      `CREATE INDEX "IDX_ai_knowledge_chunks_lesson" ON "ai_knowledge_chunks" ("lesson_id")`,
    );
    expect(queries).toContain(
      `CREATE INDEX "IDX_ai_knowledge_chunks_course" ON "ai_knowledge_chunks" ("course_id")`,
    );
  });

  it('creates the embedding settings as a standalone singleton', async () => {
    const queries = await runUp();
    const settingsTable = queries.find((sql) =>
      sql.startsWith('CREATE TABLE "ai_embedding_settings"'),
    );

    expect(settingsTable).toContain(
      `CONSTRAINT "FK_ai_embedding_settings_updated_by" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    expect(settingsTable).toContain('"api_key_encrypted" text');
    expect(settingsTable).toContain('"api_key_last4" character varying(4)');
    expect(settingsTable).toContain('"dimensions" integer');
  });

  it('reverts the tables and the enum but leaves the extension installed', async () => {
    const queries = await runDown();

    expect(queries).toEqual([
      `DROP TABLE IF EXISTS "ai_embedding_settings"`,
      `DROP TABLE IF EXISTS "ai_knowledge_chunks"`,
      `DROP TYPE IF EXISTS "public"."ai_knowledge_source_type_enum"`,
    ]);

    // Dropping the extension would fail while any other table still uses a
    // vector column, and re-creating it is not a cost worth taking on mid-revert.
    expect(queries.join(' ')).not.toContain('DROP EXTENSION');
  });

  it('keeps entity index metadata aligned with the migration', () => {
    const metadata = getMetadataArgsStorage();
    const indexOn = (name: string) =>
      metadata.indices.find(
        (candidate) =>
          candidate.target === AiKnowledgeChunk && candidate.name === name,
      );

    expect(indexOn('UQ_ai_knowledge_chunks_source')?.columns).toEqual([
      'sourceType',
      'lessonId',
      'chunkIndex',
    ]);
    expect(indexOn('UQ_ai_knowledge_chunks_source')?.unique).toBe(true);
    expect(indexOn('IDX_ai_knowledge_chunks_lesson')?.columns).toEqual([
      'lessonId',
    ]);
    expect(indexOn('IDX_ai_knowledge_chunks_course')?.columns).toEqual([
      'courseId',
    ]);
  });

  it('declares the embedding column with the width the type has no way to imply', () => {
    const metadata = getMetadataArgsStorage();
    const column = metadata.columns.find(
      (candidate) =>
        candidate.target === AiKnowledgeChunk &&
        candidate.propertyName === 'embedding',
    );

    // Three places have to agree on the width: this column, the migration's DDL
    // and the embedding default. The column is the one that is easy to get wrong
    // — `type: 'vector'` without `length` compiles and works at runtime, but
    // reads as width-less to a schema diff, which then proposes dropping and
    // recreating the column (and with it every embedding in the corpus).
    expect(column?.options.length).toBe(DEFAULT_EMBEDDING_DIMENSIONS);
    expect(column?.options.type).toBe('vector');
  });

  it('keeps every identifier inside the Postgres limit', async () => {
    const queries = [...(await runUp()), ...(await runDown())];
    const identifiers = queries
      .join(' ')
      .match(/"(?:UQ|IDX|PK|FK)_[A-Za-z0-9_]+"/g);

    expect(identifiers?.length).toBeGreaterThan(0);
    for (const identifier of identifiers ?? []) {
      expect(identifier.length - 2).toBeLessThanOrEqual(63);
    }
  });
});
