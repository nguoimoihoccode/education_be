import { getMetadataArgsStorage } from 'typeorm';
import { AiRetrievalLog } from '../../modules/ai/entities/ai-retrieval-log.entity';
import { AddAiRetrievalLogs1900000000000 } from '../migrations/1900000000000-AddAiRetrievalLogs';

describe('AddAiRetrievalLogs1900000000000', () => {
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
    await new AddAiRetrievalLogs1900000000000().up(queryRunner as never);
    return queries;
  };

  const runDown = async () => {
    const { queries, queryRunner } = createQueryRunner();
    await new AddAiRetrievalLogs1900000000000().down(queryRunner as never);
    return queries;
  };

  it('creates the log table and nothing else', async () => {
    const queries = await runUp();

    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain('CREATE TABLE "ai_retrieval_logs"');
    expect(queries[1]).toBe(
      'CREATE INDEX "IDX_ai_retrieval_logs_created_at" ON "ai_retrieval_logs" ("created_at")',
    );
  });

  it('keeps the log free of foreign keys, like every other ai_* pointer column', async () => {
    const queries = await runUp();
    const table = queries.find((sql) =>
      sql.startsWith('CREATE TABLE "ai_retrieval_logs"'),
    );

    // A log must never block a delete of the conversation or lesson it points
    // at; the ids exist for human reading, not integrity.
    expect(table).not.toContain('REFERENCES');
    expect(table).toContain('"conversation_id" uuid');
    expect(table).toContain('"lesson_id" uuid');
  });

  it('carries the columns the threshold decision is made from', async () => {
    const queries = await runUp();
    const table = queries.find((sql) =>
      sql.startsWith('CREATE TABLE "ai_retrieval_logs"'),
    );

    expect(table).toContain('"query_preview" character varying(300) NOT NULL');
    expect(table).toContain('"candidate_count" integer NOT NULL');
    expect(table).toContain('"hit_count" integer NOT NULL');
    expect(table).toContain('"best_distance" real');
    expect(table).toContain('"distances" jsonb NOT NULL');
  });

  it('reverts by dropping the table', async () => {
    expect(await runDown()).toEqual([
      'DROP TABLE IF EXISTS "ai_retrieval_logs"',
    ]);
  });

  it('keeps entity index metadata aligned with the migration', () => {
    const metadata = getMetadataArgsStorage();
    const indexOn = metadata.indices.find(
      (candidate) =>
        candidate.target === AiRetrievalLog &&
        candidate.name === 'IDX_ai_retrieval_logs_created_at',
    );

    expect(indexOn?.columns).toEqual(['createdAt']);
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
