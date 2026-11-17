import { DataSource, QueryRunner } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { AddAiUsageLogs1930000000000 } from '../../database/migrations/1930000000000-AddAiUsageLogs';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { AiService } from './ai.service';

const suite = process.env.AI_TEST_PG === 'true' ? describe : describe.skip;

suite('AI usage report on real PostgreSQL (rollback schema)', () => {
  let db: DataSource;
  let runner: QueryRunner;
  beforeAll(async () => {
    db = new DataSource({
      type: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      username: process.env.AI_TEST_PG_USER || userInfo().username,
      password: process.env.AI_TEST_PG_PASSWORD || '',
      database: 'postgres',
      entities: [AiUsageLog],
    });
    await db.initialize();
    runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const schema = `ai_usage_${randomUUID().replace(/-/g, '')}`;
    await runner.query(`CREATE SCHEMA ${schema}`);
    await runner.query(`SET LOCAL search_path TO ${schema},public`);
    await runner.query('CREATE TABLE ai_provider_settings (id uuid)');
    await new AddAiUsageLogs1930000000000().up(runner);
  });
  afterAll(async () => {
    await runner?.rollbackTransaction();
    await runner?.release();
    await db?.destroy();
  });

  it('sums tokens and known cost per local day, feature, model and user', async () => {
    const insert = (row: Partial<AiUsageLog>, at: string) =>
      runner.query(
        `INSERT INTO ai_usage_logs(user_id,feature,model,provider_host,status,
           prompt_tokens,completion_tokens,total_tokens,cost_micros,created_at)
         VALUES($1,$2,'m','api.groq.com',$3,$4,$5,$6,$7,$8)`,
        [
          row.userId ?? null,
          row.feature,
          row.status ?? 'ok',
          row.promptTokens ?? null,
          row.completionTokens ?? null,
          row.totalTokens ?? null,
          row.costMicros ?? null,
          at,
        ],
      );
    // 2026-03-01 23:30 UTC is already 2026-03-02 in Vietnam.
    await insert(
      {
        userId: 5,
        feature: 'tutor_chat',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        costMicros: 99,
      },
      '2026-03-01T23:30:00Z',
    );
    await insert(
      {
        userId: 5,
        feature: 'tutor_chat',
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
      '2026-03-02T03:00:00Z',
    );
    await insert(
      { feature: 'quiz_generate', status: 'error' },
      '2026-03-03T03:00:00Z',
    );
    const service = new AiService(
      { get: () => undefined } as any,
      {} as any,
      {} as any,
      { find: async () => [] } as any,
      {} as any,
      {} as any,
      {} as any,
      fetch,
      {
        query: (sql: string, params: unknown[]) => runner.query(sql, params),
      } as any,
    );
    const r = await service.getUsage('2026-03-02', '2026-03-03');
    expect(r).toMatchObject({
      calls: 3,
      errorCalls: 1,
      promptTokens: 110,
      totalTokens: 165,
      knownCostMicros: 99,
      knownCostUsd: 0.000099,
      unknownCostCalls: 1,
      pricing: { source: 'default' },
    });
    expect(r.byDay.map((d: any) => [d.day, d.calls])).toEqual([
      ['2026-03-02', 2],
      ['2026-03-03', 1],
    ]);
    expect(r.byFeature[0]).toMatchObject({ feature: 'tutor_chat', calls: 2 });
    expect(r.topUsers).toEqual([
      expect.objectContaining({ userId: 5, totalTokens: 165 }),
    ]);
  });
});
