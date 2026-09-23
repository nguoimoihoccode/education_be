import { Repository } from 'typeorm';
import { CacheService } from '../../common/cache/cache.service';
import { EmbeddingService } from './embedding.service';
import { AiKnowledgeChunk } from './entities/ai-knowledge-chunk.entity';
import { AiRetrievalLog } from './entities/ai-retrieval-log.entity';
import {
  DEFAULT_RETRIEVAL_LIMIT,
  KnowledgeRetrievalService,
  MAX_COSINE_DISTANCE,
  MAX_RETRIEVAL_LIMIT,
  QUERY_PREVIEW_LENGTH,
  RETRIEVAL_STATS_MAX_WINDOW_DAYS,
} from './knowledge-retrieval.service';

const LESSON = '11111111-1111-4111-8111-111111111111';
const COURSE = '33333333-3333-4333-8333-333333333333';

describe('KnowledgeRetrievalService', () => {
  let chunksRepo: { query: jest.Mock };
  let logsRepo: { insert: jest.Mock; query: jest.Mock; delete: jest.Mock };
  let embedding: { resolveConfig: jest.Mock; embed: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };
  let service: KnowledgeRetrievalService;

  const configured = () =>
    embedding.resolveConfig.mockResolvedValue({
      apiKey: 'key-12345678',
      baseUrl: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      source: {
        baseUrl: 'default',
        apiKey: 'env',
        model: 'default',
        dimensions: 'default',
      },
    });

  const row = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'chunk-1',
    source_type: 'lesson',
    lesson_id: LESSON,
    course_id: COURSE,
    title: 'Thì hiện tại tiếp diễn',
    content: 'Diễn tả hành động đang xảy ra.',
    distance: 0.21,
    ...overrides,
  });

  beforeEach(() => {
    chunksRepo = { query: jest.fn().mockResolvedValue([row()]) };
    logsRepo = {
      insert: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    embedding = {
      resolveConfig: jest.fn(),
      embed: jest.fn().mockResolvedValue([[0.1, 0.2]]),
    };
    cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };
    configured();

    service = new KnowledgeRetrievalService(
      chunksRepo as unknown as Repository<AiKnowledgeChunk>,
      logsRepo as unknown as Repository<AiRetrievalLog>,
      embedding as unknown as EmbeddingService,
      cache as unknown as CacheService,
    );
  });

  it('returns hits shaped from the query rows', async () => {
    const hits = await service.search('thì hiện tại tiếp diễn là gì');

    expect(hits).toEqual([
      {
        id: 'chunk-1',
        sourceType: 'lesson',
        lessonId: LESSON,
        courseId: COURSE,
        title: 'Thì hiện tại tiếp diễn',
        content: 'Diễn tả hành động đang xảy ra.',
        distance: 0.21,
      },
    ]);
  });

  // pg returns double precision as a number but the driver is not contractually
  // obliged to, and a string distance would silently compare as a number nowhere.
  it('coerces a string distance to a number', async () => {
    chunksRepo.query.mockResolvedValue([row({ distance: '0.21' })]);

    const [hit] = await service.search('query');

    expect(hit.distance).toBe(0.21);
  });

  it('searches by the current lesson when one is given', async () => {
    await service.search('query', { lessonId: LESSON });

    const [sql, params] = chunksRepo.query.mock.calls[0];
    expect(sql).toContain('lesson_id = $2');
    expect(params).toContain(LESSON);
  });

  // The lesson-scoped tier already put this lesson in the prompt in full, so
  // retrieving pieces of it again spends the budget to repeat what the model read.
  it('excludes the lesson already in the prompt', async () => {
    await service.search('query', { excludeLessonId: LESSON });

    const [sql, params] = chunksRepo.query.mock.calls[0];
    expect(sql).toContain('lesson_id <> $2');
    expect(params).toContain(LESSON);
  });

  // These ids reach the query from the client, and a malformed one would be an
  // invalid-uuid error rather than simply an unfiltered search.
  it('drops a filter whose id is not a uuid', async () => {
    await service.search('query', { lessonId: 'not-a-uuid', courseId: COURSE });

    const [sql, params] = chunksRepo.query.mock.calls[0];
    expect(sql).not.toContain('lesson_id =');
    expect(sql).toContain('course_id = $2');
    expect(params).not.toContain('not-a-uuid');
  });

  // The threshold lives in code now, not in the WHERE clause: the point of the
  // retrieval log is to see the near-misses, and SQL filtering would throw them
  // away before anything could record them.
  it('applies ordering in SQL and the threshold after it', async () => {
    await service.search('query');

    const [sql] = chunksRepo.query.mock.calls[0];
    expect(sql).toContain('ORDER BY embedding <=> $1::vector');
    expect(sql).not.toContain('::vector <=');
  });

  it('drops candidates beyond the threshold but keeps them for the log', async () => {
    chunksRepo.query.mockResolvedValue([
      row({ id: 'chunk-1', distance: 0.4 }),
      row({ id: 'chunk-2', distance: 0.8 }),
    ]);

    const hits = await service.search('query');

    expect(hits.map((hit) => hit.id)).toEqual(['chunk-1']);
    expect(logsRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateCount: 2,
        hitCount: 1,
        bestDistance: 0.4,
        distances: [0.4, 0.8],
      }),
    );
  });

  it('caps the hits after the scan, not in the SQL', async () => {
    chunksRepo.query.mockResolvedValue([
      row({ id: 'chunk-1', distance: 0.2 }),
      row({ id: 'chunk-2', distance: 0.3 }),
    ]);

    const hits = await service.search('query', { limit: 1 });

    expect(hits).toHaveLength(1);
    const [sql, params] = chunksRepo.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(MAX_RETRIEVAL_LIMIT);
    expect(sql).toContain(`LIMIT $${params.length}`);
  });

  it('falls back to the default limit for a missing or nonsensical one', async () => {
    chunksRepo.query.mockResolvedValue(
      Array.from({ length: MAX_RETRIEVAL_LIMIT }, (_, index) =>
        row({ id: `chunk-${index}`, distance: 0.1 }),
      ),
    );

    expect(await service.search('query', { limit: 0 })).toHaveLength(
      DEFAULT_RETRIEVAL_LIMIT,
    );

    const nanResult = await service.search('query', { limit: Number.NaN });
    expect(nanResult).toHaveLength(DEFAULT_RETRIEVAL_LIMIT);
  });

  it('makes no request and no query for an empty question', async () => {
    expect(await service.search('   ')).toEqual([]);
    expect(embedding.embed).not.toHaveBeenCalled();
    expect(chunksRepo.query).not.toHaveBeenCalled();
    expect(logsRepo.insert).not.toHaveBeenCalled();
  });

  // Tầng A still answers, so a learner's message must not fail over this.
  it('returns nothing rather than throwing when no provider is configured', async () => {
    embedding.resolveConfig.mockResolvedValue({ apiKey: undefined });

    expect(await service.search('query')).toEqual([]);
    expect(embedding.embed).not.toHaveBeenCalled();
    expect(logsRepo.insert).not.toHaveBeenCalled();
  });

  it('returns nothing rather than throwing when the provider fails', async () => {
    embedding.embed.mockRejectedValue(new Error('ECONNREFUSED'));

    expect(await service.search('query')).toEqual([]);
    expect(chunksRepo.query).not.toHaveBeenCalled();
    expect(logsRepo.insert).not.toHaveBeenCalled();
  });

  describe('retrieval log', () => {
    // The row is the datapoint that makes MAX_COSINE_DISTANCE tunable: what the
    // scan saw, what passed, and enough context to judge why.
    it('logs one row per search with context and a truncated preview', async () => {
      const question = '  thì   hiện\ntại là gì  '.repeat(30);

      await service.search(question, {
        logContext: { conversationId: 'conv-1', lessonId: LESSON },
      });

      expect(logsRepo.insert).toHaveBeenCalledTimes(1);
      const logged = logsRepo.insert.mock.calls[0][0];
      expect(logged).toMatchObject({
        conversationId: 'conv-1',
        lessonId: LESSON,
        candidateCount: 1,
        hitCount: 1,
        bestDistance: 0.21,
        distances: [0.21],
      });
      expect(logged.queryPreview.startsWith('thì hiện tại là gì')).toBe(true);
      expect(logged.queryPreview.length).toBeLessThanOrEqual(
        QUERY_PREVIEW_LENGTH,
      );
    });

    it('logs a zero-candidate search with a null best distance', async () => {
      chunksRepo.query.mockResolvedValue([]);

      await service.search('chuyện gì chưa có trong tài liệu');

      expect(logsRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateCount: 0,
          hitCount: 0,
          bestDistance: null,
          distances: [],
        }),
      );
    });

    it('records near-miss distances that the hits never show', async () => {
      chunksRepo.query.mockResolvedValue([row({ distance: 0.78 })]);

      const hits = await service.search('query');

      expect(hits).toEqual([]);
      expect(logsRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          hitCount: 0,
          bestDistance: 0.78,
        }),
      );
    });

    // The log informs tuning; losing one row to a transient write failure is
    // acceptable, failing the learner's message over it is not.
    it('still answers when writing the log fails', async () => {
      logsRepo.insert.mockRejectedValue(new Error('write failed'));

      const hits = await service.search('query');

      expect(hits).toHaveLength(1);
    });
  });

  describe('stats', () => {
    const statRow = (
      best_distance: number | null,
      hit_count: number,
    ): { best_distance: number | null; hit_count: number } => ({
      best_distance,
      hit_count,
    });

    const rows = [
      statRow(0.2, 3),
      statRow(0.8, 0),
      statRow(0.9, 0),
      statRow(null, 0),
    ];

    it('aggregates the window into the numbers the threshold decision needs', async () => {
      logsRepo.query.mockResolvedValueOnce(rows).mockResolvedValueOnce([
        {
          query_preview: 'ngữ pháp quá khứ',
          best_distance: 0.8,
          created_at: new Date('2026-09-23T01:00:00Z'),
        },
      ]);

      const result = await service.stats();

      expect(result.windowDays).toBe(30);
      expect(result.currentThreshold).toBe(MAX_COSINE_DISTANCE);
      expect(result.totalQueries).toBe(4);
      expect(result.queriesWithHits).toBe(1);
      expect(result.zeroHitQueries).toBe(3);
      expect(result.zeroHitRate).toBeCloseTo(0.75);
      expect(result.avgHitCount).toBeCloseTo(0.75);
      expect(result.bestDistance.min).toBe(0.2);
      expect(result.bestDistance.max).toBe(0.9);
      expect(result.bestDistance.avg).toBeCloseTo(1.9 / 3);
      expect(result.bestDistance.p50).toBeCloseTo(0.8);
      expect(result.bestDistance.p90).toBeCloseTo(0.8);
      expect(result.buckets).toEqual([
        { key: 'very-close', from: 0, to: 0.3, count: 1 },
        { key: 'close', from: 0.3, to: 0.5, count: 0 },
        { key: 'edge', from: 0.5, to: MAX_COSINE_DISTANCE, count: 0 },
        { key: 'beyond', from: MAX_COSINE_DISTANCE, to: 0.9, count: 1 },
        { key: 'far', from: 0.9, to: null, count: 1 },
        { key: 'none', from: null, to: null, count: 1 },
      ]);
      expect(result.recentZeroHitQueries).toEqual([
        {
          queryPreview: 'ngữ pháp quá khứ',
          bestDistance: 0.8,
          createdAt: '2026-09-23T01:00:00.000Z',
        },
      ]);
    });

    it('returns nulls and empty buckets over an empty window', async () => {
      const result = await service.stats();

      expect(result.totalQueries).toBe(0);
      expect(result.zeroHitRate).toBe(0);
      expect(result.avgHitCount).toBeNull();
      expect(result.bestDistance.p50).toBeNull();
      expect(result.bestDistance.max).toBeNull();
      expect(result.buckets.every((bucket) => bucket.count === 0)).toBe(true);
      expect(result.recentZeroHitQueries).toEqual([]);
    });

    it('asks Postgres for the clamped window in both queries', async () => {
      await service.stats(RETRIEVAL_STATS_MAX_WINDOW_DAYS + 500);

      expect(logsRepo.query).toHaveBeenCalledTimes(2);
      expect(logsRepo.query.mock.calls[0][0]).toContain('days => 90::int');
      expect(logsRepo.query.mock.calls[1][0]).toContain('days => 90::int');
      // The zero-hit sample only makes sense per window and newest-first.
      expect(logsRepo.query.mock.calls[1][0]).toContain('hit_count = 0');
      expect(logsRepo.query.mock.calls[1][0]).toContain(
        'ORDER BY created_at DESC',
      );

      logsRepo.query.mockClear();
      await service.stats(Number.NaN);
      expect(logsRepo.query.mock.calls[0][0]).toContain('days => 30::int');
    });
  });

  describe('pruneOldLogs', () => {
    it('deletes rows past the retention window and reports the count', async () => {
      logsRepo.delete.mockResolvedValue({ affected: 7 });

      await expect(service.pruneOldLogs()).resolves.toBe(7);

      // `LessThan` wraps the cutoff in a FindOperator; the Date itself sits in
      // `.value`.
      const criteria = logsRepo.delete.mock.calls[0][0];
      const cutoff = criteria.createdAt.value as Date;
      const cutoffDays =
        (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
      expect(cutoffDays).toBeGreaterThan(89);
      expect(cutoffDays).toBeLessThan(91);
    });
  });

  describe('query embedding cache', () => {
    it('reuses a cached vector instead of calling the provider again', async () => {
      cache.get.mockResolvedValue([0.9, 0.9]);

      await service.search('thì hiện tại tiếp diễn là gì');

      expect(embedding.embed).not.toHaveBeenCalled();
      expect(chunksRepo.query.mock.calls[0][1][0]).toBe('[0.9,0.9]');
    });

    it('caches the vector it just computed', async () => {
      await service.search('query');

      expect(cache.set).toHaveBeenCalledWith(
        expect.any(String),
        [0.1, 0.2],
        expect.any(Number),
      );
    });

    // Normalizing before hashing is what makes the cache useful in practice: the
    // same question typed with different spacing is the same question.
    it('treats whitespace variants of one question as the same cache entry', async () => {
      await service.search('thì  hiện tại\ntiếp diễn');
      const first = cache.get.mock.calls[0][0];

      cache.get.mockClear();
      await service.search('  thì hiện tại tiếp diễn  ');

      expect(cache.get.mock.calls[0][0]).toBe(first);
    });

    // The vectors of two different models are not comparable, so a cached vector
    // from the old model would retrieve by coincidence rather than by meaning.
    it('does not reuse a vector across a model change', async () => {
      await service.search('query');
      const before = cache.get.mock.calls[0][0];

      cache.get.mockClear();
      embedding.resolveConfig.mockResolvedValue({
        apiKey: 'key-12345678',
        baseUrl: 'https://api.openai.com/v1',
        model: 'other-model',
        dimensions: 1536,
        source: {
          baseUrl: 'default',
          apiKey: 'env',
          model: 'db',
          dimensions: 'default',
        },
      });
      await service.search('query');

      expect(cache.get.mock.calls[0][0]).not.toBe(before);
    });
  });
});
