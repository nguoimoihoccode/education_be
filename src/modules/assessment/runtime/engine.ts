import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  AssessmentJob,
  AssessmentSubmission,
} from '../entities/assessment.entities';
import { hash } from '../domain/assessment.policy';
import { AssessmentStorage } from './storage';
import { parseRouting } from './routing';
import type { Routing } from './routing';
import { AssessmentProcessor } from './processor';
import { checkWorkspaceAdmission } from './preparation';
export function returningRows<T>(raw: unknown): T[] {
  if (!Array.isArray(raw)) throw new Error('database_result_invalid');
  return (
    Array.isArray(raw[0]) && typeof raw[1] === 'number' ? raw[0] : raw
  ) as T[];
}
export function retryDecision(
  code: string,
  attempt: number,
): { state: string; delayMs: number } {
  if (['job_stale', 'job_lease_lost'].includes(code))
    return { state: 'cancelled', delayMs: 0 };
  if (
    /budget|credentials|routing|profile_|workspace_|audit_seed|exam_code_conflict|exam_questions_not_found/.test(
      code,
    )
  )
    return { state: 'paused', delayMs: 0 };
  if (
    attempt < 3 &&
    /provider_http_(429|5\d\d)|fetch failed|timeout|ECONN|ETIMEDOUT|assets_not_ready/.test(
      code,
    )
  )
    return { state: 'retry_wait', delayMs: attempt === 1 ? 2000 : 10000 };
  return { state: 'failed', delayMs: 0 };
}
export class AssessmentEngine {
  private readonly owner = randomUUID();
  private readonly redis: IORedis;
  private readonly queue: Queue;
  private worker?: Worker;
  private dispatching = false;
  private timer?: NodeJS.Timeout;
  private stopping = false;
  constructor(
    private readonly db: DataSource,
    private readonly cfg: Routing,
    private readonly workspace: string,
    private readonly storage = new AssessmentStorage(),
  ) {
    const url = process.env.ASSESSMENT_QUEUE_REDIS_URL;
    if (!url || url === process.env.REDIS_URL)
      throw new Error('dedicated_queue_required');
    this.redis = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.redis.on('error', () => {
      /* Queue connectivity is reported by health/startup, never log URLs. */
    });
    this.queue = new Queue('assessment-v1', {
      connection: this.redis as never,
    });
  }
  async start() {
    await Promise.race([
      this.redis.ping(),
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('queue_startup_timeout')),
          10000,
        );
        timer.unref();
      }),
    ]);
    const config = (await this.redis.config(
      'GET',
      'maxmemory-policy',
    )) as string[];
    if (config[1] !== 'noeviction')
      throw new Error('queue_noeviction_required');
    const aof = (await this.redis.config('GET', 'appendonly')) as string[];
    if (aof[1] !== 'yes') throw new Error('queue_aof_required');
    await this.storage.ready();
    await checkWorkspaceAdmission(
      this.workspace,
      this.cfg.execution.admitFreeDiskGiB,
    );
    await this.queue.setGlobalConcurrency(this.cfg.execution.maxParallelJobs);
    this.worker = new Worker(
      'assessment-v1',
      async (delivery) => {
        const id = (delivery.data as { jobId: string }).jobId;
        await this.execute(id);
      },
      {
        connection: this.redis as never,
        concurrency: this.cfg.execution.maxParallelJobs,
        lockDuration: 180000,
      },
    );
    this.worker.on('error', () => {
      /* Persistent DB state is recovered by dispatch. */
    });
    await this.worker.waitUntilReady();
    await this.dispatch();
    this.timer = setInterval(() => {
      void this.dispatch().catch(() => undefined);
    }, 3000);
  }
  async health(): Promise<void> {
    if (this.stopping || !this.worker?.isRunning())
      throw new Error('worker_unavailable');
    await this.redis.ping();
    await this.db.query('SELECT 1');
    await checkWorkspaceAdmission(
      this.workspace,
      this.cfg.execution.pauseBelowFreeDiskGiB,
    );
  }
  private async dispatch() {
    if (this.dispatching || this.stopping) return;
    this.dispatching = true;
    try {
      await checkWorkspaceAdmission(
        this.workspace,
        this.cfg.execution.admitFreeDiskGiB,
      );
      // PostgreSQL remains authoritative if Redis loses its AOF tail or delivery.
      await this.db.query(
        `UPDATE school_assessment_jobs SET state='failed',last_error_code='attempt_limit',lease_token=NULL,lease_owner=NULL,lease_until=NULL WHERE state='running' AND lease_until<now() AND attempt_count>=3`,
      );
      const rows = await this.db.transaction(async (m) => {
        const pending = returningRows<{ id: string }>(
          await m.query(
            `SELECT id FROM school_assessment_jobs WHERE execution_target='vps_colocated' AND attempt_count<3 AND next_attempt_at<=now() AND (state IN ('pending','dispatched','retry_wait') OR (state='running' AND lease_until<now())) ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED`,
          ),
        );
        const result: { id: string; generation: number }[] = [];
        for (const row of pending) {
          const updated = returningRows<{
            id: string;
            dispatch_generation: number;
          }>(
            await m.query(
              `UPDATE school_assessment_jobs SET state='dispatched',dispatch_generation=dispatch_generation+1,next_attempt_at=now()+interval '30 seconds',lease_token=NULL,lease_owner=NULL,lease_until=NULL WHERE id=$1 RETURNING dispatch_generation`,
              [row.id],
            ),
          );
          result.push({
            id: row.id,
            generation: updated[0].dispatch_generation,
          });
        }
        return result;
      });
      for (const row of rows)
        await this.queue.add(
          'assessment',
          { jobId: row.id },
          {
            jobId: `assessment-${row.id}-${row.generation}`,
            removeOnComplete: 100,
            removeOnFail: 100,
            attempts: 1,
          },
        );
    } finally {
      this.dispatching = false;
    }
  }
  private async execute(id: string) {
    if (this.stopping) return;
    await checkWorkspaceAdmission(
      this.workspace,
      this.cfg.execution.admitFreeDiskGiB,
    );
    const token = randomUUID();
    const rows = returningRows<{ id: string }>(
      await this.db.query(
        `UPDATE school_assessment_jobs SET state='running',lease_token=$2,lease_owner=$3,lease_until=now()+interval '180 seconds',fencing_token=fencing_token+1,attempt_count=attempt_count+1 WHERE id=$1 AND state IN ('dispatched','pending','retry_wait') AND (state='dispatched' OR next_attempt_at<=now()) AND attempt_count<3 RETURNING id`,
        [id, token, this.owner],
      ),
    );
    if (!rows.length) return;
    const job = await this.db
      .getRepository(AssessmentJob)
      .findOneByOrFail({ id, leaseToken: token });
    const heartbeat = setInterval(() => {
      void this.db
        .query(
          `UPDATE school_assessment_jobs SET lease_until=now()+interval '180 seconds' WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>now()`,
          [id, token],
        )
        .catch(() => undefined);
    }, 30000);
    try {
      let cfg = this.cfg;
      if (['extract', 'grade', 'template', 'aggregate'].includes(job.stage)) {
        const snapshot = (job.data as { routingSnapshot?: unknown })
          .routingSnapshot;
        if (!snapshot) throw new Error('routing_snapshot_required');
        cfg = parseRouting(snapshot);
        if (
          hash(cfg) !== job.routingPolicyHash ||
          cfg.routingVersion !== job.routingVersion
        )
          throw new Error('routing_snapshot_mismatch');
      }
      await new AssessmentProcessor(
        this.db,
        this.storage,
        cfg,
        this.workspace,
      ).process(job);
      await this.db.query(
        `UPDATE school_assessment_jobs SET state='succeeded',lease_token=NULL,lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>now()`,
        [id, token],
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : 'job_failed';
      const decision = retryDecision(code, job.attemptCount);
      await this.db.transaction(async (m) => {
        const updated = returningRows<{
          id: string;
          dispatch_generation: number;
        }>(
          await m.query(
            `UPDATE school_assessment_jobs SET state=$3,last_error_code=$4,next_attempt_at=now()+($5::int*interval '1 millisecond'),lease_token=NULL,lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 AND state='running' RETURNING id`,
            [id, token, decision.state, code.slice(0, 100), decision.delayMs],
          ),
        );
        if (
          updated.length &&
          job.submissionId &&
          decision.state !== 'cancelled'
        ) {
          const inputRevision = (job.data as { inputRevision?: number })
            .inputRevision;
          if (inputRevision)
            await m.update(
              AssessmentSubmission,
              { id: job.submissionId, schoolId: job.schoolId, inputRevision },
              {
                processingState:
                  decision.state === 'retry_wait' ? 'queued' : decision.state,
              },
            );
        }
      });
    } finally {
      clearInterval(heartbeat);
    }
  }
  async stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue.close();
    if (this.redis.status === 'ready') await this.redis.quit();
    else this.redis.disconnect();
  }
}
