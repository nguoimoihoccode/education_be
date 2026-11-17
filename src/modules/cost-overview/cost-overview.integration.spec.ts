import { DataSource, QueryRunner } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { AddAiUsageLogs1930000000000 } from '../../database/migrations/1930000000000-AddAiUsageLogs';
import { CostOverviewService } from './cost-overview.service';

const suite = process.env.AI_TEST_PG === 'true' ? describe : describe.skip;

suite('cost overview on real PostgreSQL (rollback schema)', () => {
  let db: DataSource;
  let runner: QueryRunner;
  let service: CostOverviewService;
  const school = randomUUID();
  beforeAll(async () => {
    db = new DataSource({
      type: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      username: process.env.AI_TEST_PG_USER || userInfo().username,
      password: process.env.AI_TEST_PG_PASSWORD || '',
      database: 'postgres',
    });
    await db.initialize();
    runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const schema = `cost_${randomUUID().replace(/-/g, '')}`;
    await runner.query(`CREATE SCHEMA ${schema}`);
    await runner.query(`SET LOCAL search_path TO ${schema},public`);
    await runner.query('CREATE TABLE ai_provider_settings (id uuid)');
    await new AddAiUsageLogs1930000000000().up(runner);
    await runner.query(`CREATE TABLE school_assessment_provider_calls (
      school_id uuid NOT NULL, purpose text NOT NULL, state text NOT NULL,
      input_usage jsonb NOT NULL DEFAULT '{}', output_usage jsonb NOT NULL DEFAULT '{}',
      reserved_cost_micros bigint NOT NULL, actual_cost_micros bigint,
      error_code text, created_at timestamptz NOT NULL)`);
    service = new CostOverviewService({
      query: (sql: string, params: unknown[]) => runner.query(sql, params),
    } as unknown as DataSource);
  });
  afterAll(async () => {
    await runner?.rollbackTransaction();
    await runner?.release();
    await db?.destroy();
  });

  it('reports grading and each AI feature as separate sources', async () => {
    const call = (
      purpose: string,
      state: string,
      actual: number | null,
      at: string,
      schoolId = school,
    ) =>
      runner.query(
        `INSERT INTO school_assessment_provider_calls
           (school_id,purpose,state,input_usage,output_usage,reserved_cost_micros,actual_cost_micros,created_at)
         VALUES($1,$2,$3,'{"tokens":1000}','{"tokens":200}',900,$4,$5)`,
        [schoolId, purpose, state, actual, at],
      );
    await call('vision_extract', 'succeeded', 700, '2026-03-01T23:30:00Z');
    await call('text_grade', 'unknown', null, '2026-03-02T03:00:00Z');
    await call('text_grade', 'not_sent', null, '2026-03-02T04:00:00Z');
    await call(
      'text_grade',
      'succeeded',
      50,
      '2026-03-02T05:00:00Z',
      randomUUID(),
    );
    await runner.query(
      `INSERT INTO ai_usage_logs(feature,model,provider_host,status,prompt_tokens,completion_tokens,total_tokens,cost_micros,created_at)
       VALUES('tutor_chat','m','h','ok',10,5,15,30,'2026-03-02T03:00:00Z'),
             ('tutor_chat','m','h','ok',10,5,15,NULL,'2026-03-02T03:00:00Z')`,
    );
    const o = await service.overview('2026-03-02', '2026-03-02');
    const grading = o.sources.find((s) => s.key === 'assessment_grading')!;
    expect(grading).toMatchObject({
      calls: 4,
      inputTokens: 4000,
      knownCostMicros: 750,
      unknownCostCalls: 1,
      upperBoundCostMicros: 1650,
    });
    expect(o.sources.find((s) => s.key === 'tutor_chat')).toMatchObject({
      calls: 2,
      knownCostMicros: 30,
      unknownCostCalls: 1,
    });
    expect(o.total.knownCostMicros).toBe(780);
    const one = await service.overview('2026-03-02', '2026-03-02', school);
    expect(one.total).toMatchObject({ calls: 3, knownCostMicros: 700 });
    expect(one.sources.find((s) => s.key === 'tutor_chat')!.calls).toBe(0);
    await expect(
      service.overview('2026-03-02', '2025-01-01'),
    ).rejects.toThrow();
    await expect(
      service.overview('2026-02-01', '2026-02-31'),
    ).rejects.toThrow();
  });
});
