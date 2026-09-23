import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  RETRIEVAL_LOG_RETENTION_DAYS,
  KnowledgeRetrievalService,
} from '../knowledge-retrieval.service';
import { KnowledgeIndexService } from '../knowledge-index.service';

/**
 * The safety net for a stale index — the classic RAG failure mode, where the
 * tutor keeps quoting a lesson that has since been edited because the write path
 * that should have re-indexed it never ran.
 *
 * A full sweep is affordable because indexing is incremental: unchanged content
 * is recognised by its hash and costs one query per lesson, no provider calls.
 */
@Injectable()
export class KnowledgeReindexTask {
  private readonly logger = new Logger(KnowledgeReindexTask.name);

  constructor(
    private readonly knowledgeIndex: KnowledgeIndexService,
    private readonly knowledgeRetrieval: KnowledgeRetrievalService,
  ) {}

  /**
   * 4 AM, an hour after the token cleanup, so the two nightly sweeps do not run
   * against the database at the same time.
   *
   * Left unguarded on purpose: a failed sweep must reach the logs rather than be
   * swallowed, and it is retried by the next night's run either way.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleReindex(): Promise<void> {
    this.logger.log('Starting knowledge reindex task...');

    try {
      const summary = await this.knowledgeIndex.reindexAll();
      this.logger.log(
        `Knowledge reindex completed: ${summary.lessons} lessons, ` +
          `${summary.chunks} chunks, ${summary.embedded} embedded, ` +
          `${summary.removed} removed, ${summary.failed} failed`,
      );
    } catch (error) {
      // An unconfigured embedding provider lands here every night until an admin
      // sets one up. That is worth a log line, not a crash.
      this.logger.error(
        'Knowledge reindex failed',
        error instanceof Error ? error.stack : undefined,
      );
    }

    // The retrieval log's retention rides this task so it needs no cron of its
    // own, and its own try/catch so a reindex failure cannot skip it — or the
    // other way round.
    try {
      const pruned = await this.knowledgeRetrieval.pruneOldLogs();
      if (pruned > 0) {
        this.logger.log(
          `Pruned ${pruned} retrieval log rows older than ` +
            `${RETRIEVAL_LOG_RETENTION_DAYS} days`,
        );
      }
    } catch (error) {
      this.logger.warn(
        'Retrieval log prune failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
