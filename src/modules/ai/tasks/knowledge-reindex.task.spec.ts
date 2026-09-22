import { Logger } from '@nestjs/common';
import { KnowledgeIndexService } from '../knowledge-index.service';
import { KnowledgeReindexTask } from './knowledge-reindex.task';

describe('KnowledgeReindexTask', () => {
  let knowledgeIndex: { reindexAll: jest.Mock };
  let task: KnowledgeReindexTask;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    knowledgeIndex = { reindexAll: jest.fn() };
    task = new KnowledgeReindexTask(
      knowledgeIndex as unknown as KnowledgeIndexService,
    );
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reconciles the whole corpus', async () => {
    knowledgeIndex.reindexAll.mockResolvedValue({
      lessons: 4,
      chunks: 11,
      embedded: 2,
      removed: 0,
      failed: 0,
    });

    await task.handleReindex();

    expect(knowledgeIndex.reindexAll).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('4 lessons, 11 chunks, 2 embedded'),
    );
  });

  // An unconfigured embedding provider throws on every run. The scheduler must
  // not see an unhandled rejection, and the reason has to reach the logs —
  // a silently failing sweep looks exactly like a sweep with nothing to do.
  it('logs a failed sweep instead of throwing', async () => {
    knowledgeIndex.reindexAll.mockRejectedValue(
      new Error('Embedding provider is not configured'),
    );

    await expect(task.handleReindex()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      'Knowledge reindex failed',
      expect.any(String),
    );
  });
});
