import { Repository } from 'typeorm';
import { CacheService } from '../../common/cache/cache.service';
import { EmbeddingService } from './embedding.service';
import { AiKnowledgeChunk } from './entities/ai-knowledge-chunk.entity';
import {
  DEFAULT_RETRIEVAL_LIMIT,
  KnowledgeRetrievalService,
  MAX_COSINE_DISTANCE,
  MAX_RETRIEVAL_LIMIT,
} from './knowledge-retrieval.service';

const LESSON = '11111111-1111-4111-8111-111111111111';
const OTHER_LESSON = '22222222-2222-4222-8222-222222222222';
const COURSE = '33333333-3333-4333-8333-333333333333';

describe('KnowledgeRetrievalService', () => {
  let chunksRepo: { query: jest.Mock };
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
    expect(sql).toContain('lesson_id = $3');
    expect(params).toContain(LESSON);
  });

  // The lesson-scoped tier already put this lesson in the prompt in full, so
  // retrieving pieces of it again spends the budget to repeat what the model read.
  it('excludes the lesson already in the prompt', async () => {
    await service.search('query', { excludeLessonId: LESSON });

    const [sql, params] = chunksRepo.query.mock.calls[0];
    expect(sql).toContain('lesson_id <> $3');
    expect(params).toContain(LESSON);
  });

  // These ids reach the query from the client, and a malformed one would be an
  // invalid-uuid error rather than simply an unfiltered search.
  it('drops a filter whose id is not a uuid', async () => {
    await service.search('query', { lessonId: 'not-a-uuid', courseId: COURSE });

    const [sql, params] = chunksRepo.query.mock.calls[0];
    expect(sql).not.toContain('lesson_id =');
    expect(sql).toContain('course_id = $3');
    expect(params).not.toContain('not-a-uuid');
  });

  it('applies the distance threshold and ordering in SQL', async () => {
    await service.search('query');

    const [sql, params] = chunksRepo.query.mock.calls[0];
    expect(sql).toContain('embedding <=> $1::vector <= $2');
    expect(sql).toContain('ORDER BY embedding <=> $1::vector');
    expect(params[1]).toBe(MAX_COSINE_DISTANCE);
  });

  it('caps the number of chunks returned', async () => {
    await service.search('query', { limit: 99 });

    const [sql, params] = chunksRepo.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(MAX_RETRIEVAL_LIMIT);
    expect(sql).toContain(`LIMIT $${params.length}`);
  });

  it('falls back to the default limit for a missing or nonsensical one', async () => {
    await service.search('query', { limit: 0 });
    expect(chunksRepo.query.mock.calls[0][1].at(-1)).toBe(
      DEFAULT_RETRIEVAL_LIMIT,
    );

    chunksRepo.query.mockClear();
    await service.search('query', { limit: Number.NaN });
    expect(chunksRepo.query.mock.calls[0][1].at(-1)).toBe(
      DEFAULT_RETRIEVAL_LIMIT,
    );
  });

  it('makes no request and no query for an empty question', async () => {
    expect(await service.search('   ')).toEqual([]);
    expect(embedding.embed).not.toHaveBeenCalled();
    expect(chunksRepo.query).not.toHaveBeenCalled();
  });

  // Tầng A still answers, so a learner's message must not fail over this.
  it('returns nothing rather than throwing when no provider is configured', async () => {
    embedding.resolveConfig.mockResolvedValue({ apiKey: undefined });

    expect(await service.search('query')).toEqual([]);
    expect(embedding.embed).not.toHaveBeenCalled();
  });

  it('returns nothing rather than throwing when the provider fails', async () => {
    embedding.embed.mockRejectedValue(new Error('ECONNREFUSED'));

    expect(await service.search('query')).toEqual([]);
    expect(chunksRepo.query).not.toHaveBeenCalled();
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
