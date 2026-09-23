import { Logger } from '@nestjs/common';
import { KnowledgeIndexService } from '../knowledge-index.service';
import { KnowledgeRetrievalService } from '../knowledge-retrieval.service';
import { KnowledgeReindexTask } from './knowledge-reindex.task';

describe('KnowledgeReindexTask', () => {
  let knowledgeIndex: { reindexAll: jest.Mock };
  let knowledgeRetrieval: { pruneOldLogs: jest.Mock };
  let task: KnowledgeReindexTask;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    knowledgeIndex = { reindexAll: jest.fn() };
    knowledgeRetrieval = { pruneOldLogs: jest.fn().mockResolvedValue(0) };
    task = new KnowledgeReindexTask(
      knowledgeIndex as unknown as KnowledgeIndexService,
      knowledgeRetrieval as unknown as KnowledgeRetrievalService,
    );
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
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

  it('prunes old retrieval log rows after the sweep', async () => {
    knowledgeRetrieval.pruneOldLogs.mockResolvedValue(12);

    await task.handleReindex();

    expect(knowledgeRetrieval.pruneOldLogs).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Pruned 12 retrieval log rows'),
    );
  });

  it('says nothing about the prune when it removed nothing', async () => {
    await task.handleReindex();

    expect(knowledgeRetrieval.pruneOldLogs).toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Pruned'));
  });

  // The two jobs ride the same cron on purpose, but neither may take the other
  // down: a broken prune is a warn, not a crashed night.
  it('warns instead of throwing when the prune fails', async () => {
    knowledgeRetrieval.pruneOldLogs.mockRejectedValue(new Error('boom'));

    await expect(task.handleReindex()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      'Retrieval log prune failed',
      expect.any(String),
    );
  });
});
