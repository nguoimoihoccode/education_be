import { Logger } from '@nestjs/common';
import { EducationService } from './education.service';
import type { KnowledgeIndexService } from '../ai/knowledge-index.service';

const createRepository = (
  overrides: Record<string, unknown> = {},
): Record<string, any> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  count: jest.fn(),
  create: jest.fn((value) => value),
  save: jest.fn((value) => Promise.resolve(value)),
  update: jest.fn(),
  ...overrides,
});

const createKnowledgeIndex = (overrides: Record<string, unknown> = {}) => ({
  isConfigured: jest.fn().mockResolvedValue(true),
  reindexLesson: jest
    .fn()
    .mockResolvedValue({ lessonId: 'x', chunks: 1, embedded: 1, removed: 0 }),
  ...overrides,
});

/**
 * Builds the facade with its full constructor argument list. `knowledgeIndex` is
 * last so the specs that construct this class with only the repositories keep
 * working — the hook is a no-op when it is absent.
 */
const createService = (
  knowledgeIndex?: ReturnType<typeof createKnowledgeIndex>,
) =>
  new EducationService(
    createRepository() as any,
    createRepository() as any,
    createRepository() as any,
    createRepository() as any,
    createRepository() as any,
    createRepository() as any,
    createRepository() as any,
    createRepository() as any,
    createRepository() as any,
    createRepository() as any,
    createRepository() as any,
    { completeJson: jest.fn() } as any,
    undefined,
    knowledgeIndex as unknown as KnowledgeIndexService,
  );

/**
 * The facade builds its leaf use-case services internally, so replacing one is
 * how the hook is isolated from lesson/vocabulary persistence — which
 * lesson-content.service.spec.ts already covers on its own.
 */
const stubLeaf = (
  service: EducationService,
  leaf: 'lessonContentService' | 'vocabularyService',
  method: string,
  result: unknown,
) => {
  const target = (
    service as unknown as Record<string, Record<string, unknown>>
  )[leaf];
  target[method] = jest.fn().mockResolvedValue(result);
  return target[method] as jest.Mock;
};

describe('EducationService knowledge index hook', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('reindexes the lesson a freshly created lesson belongs to', async () => {
    const index = createKnowledgeIndex();
    const service = createService(index);
    stubLeaf(service, 'lessonContentService', 'createLesson', {
      id: 'lesson-9',
    });

    await service.createLesson({ courseId: 'course-1' } as any);

    expect(index.reindexLesson).toHaveBeenCalledWith('lesson-9');
  });

  it('reindexes the lesson of a new vocabulary item', async () => {
    const index = createKnowledgeIndex();
    const service = createService(index);
    stubLeaf(service, 'vocabularyService', 'createVocabulary', {
      id: 'vocab-1',
      // Differs from the DTO below on purpose: the lesson that was actually
      // written is what must be reindexed, not the one that was requested.
      lessonId: 'lesson-from-row',
    });

    await service.createVocabulary({
      lessonId: 'lesson-from-dto',
      word: 'always',
      meaning: 'luôn luôn',
    } as any);

    expect(index.reindexLesson).toHaveBeenCalledWith('lesson-from-row');
  });

  it('returns the created lesson even when reindexing fails', async () => {
    const index = createKnowledgeIndex({
      reindexLesson: jest.fn().mockRejectedValue(new Error('provider is down')),
    });
    const service = createService(index);
    stubLeaf(service, 'lessonContentService', 'createLesson', {
      id: 'lesson-9',
    });

    // Best-effort: the learner-facing write succeeded, so the caller must not
    // see the indexing failure — the nightly sweep will pick the lesson up.
    await expect(
      service.createLesson({ courseId: 'course-1' } as any),
    ).resolves.toMatchObject({ id: 'lesson-9' });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('knowledge index refresh failed'),
    );
  });

  it('skips silently while no embedding provider is configured', async () => {
    const index = createKnowledgeIndex({
      isConfigured: jest.fn().mockResolvedValue(false),
    });
    const service = createService(index);
    stubLeaf(service, 'lessonContentService', 'createLesson', {
      id: 'lesson-9',
    });

    await service.createLesson({ courseId: 'course-1' } as any);

    // Not a failure — an admin has simply not set the provider up yet, and
    // reindexing would store chunks nobody can retrieve.
    expect(index.reindexLesson).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('does nothing when constructed without a knowledge index', async () => {
    const service = createService();
    stubLeaf(service, 'lessonContentService', 'createLesson', {
      id: 'lesson-9',
    });

    await expect(
      service.createLesson({ courseId: 'course-1' } as any),
    ).resolves.toMatchObject({ id: 'lesson-9' });
    // Absent, not broken: the specs that build this class by hand must not look
    // like a failing index refresh.
    expect(warn).not.toHaveBeenCalled();
  });
});
