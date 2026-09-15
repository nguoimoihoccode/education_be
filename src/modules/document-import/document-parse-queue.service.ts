import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { DocumentImportService } from './document-import.service';
import { FileType } from './dto/upload-document.dto';

const QUEUE_NAME = 'document-parse';
/** How long BullMQ keeps the finished job around for status polling. */
const JOB_KEEP_MS = 15 * 60 * 1000;
/** Simultaneous parses per instance; CPU-bound work is capped on purpose. */
const WORKER_CONCURRENCY = 2;

export interface DocumentParseJobData {
  jobId: string;
  userId: number;
  originalName: string;
  fileType: FileType;
  fileSize: number;
  mimetype: string;
  language?: string;
  minKeywordLength?: number;
  maxKeywords?: number;
  withPhrases: boolean;
  fileBase64: string;
}

export type DocumentParseJobStatus =
  | 'queued'
  | 'active'
  | 'completed'
  | 'failed';

export interface DocumentParseJobState {
  jobId: string;
  userId: number;
  status: DocumentParseJobStatus;
  result?: unknown;
  error?: string;
}

/**
 * Moves CPU-heavy document parsing (PDF/DOCX/XLSX extraction + keywording)
 * off the HTTP request path onto a BullMQ worker. Every backend instance
 * runs its own worker against the shared queue, so capacity scales with
 * the number of instances. Without REDIS_URL the queue degrades to an
 * in-process implementation (parse still happens off the request path).
 */
@Injectable()
export class DocumentParseQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DocumentParseQueueService.name);
  private readonly memoryJobs = new Map<string, DocumentParseJobState>();

  private queue: Queue<DocumentParseJobData> | null = null;
  private worker: Worker<DocumentParseJobData> | null = null;
  private connections: Redis[] = [];

  constructor(
    private readonly documentImportService: DocumentImportService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>('REDIS_URL');
    if (!url) {
      this.logger.log('REDIS_URL not set — document parsing runs in-process');
      return;
    }

    try {
      // BullMQ requires maxRetriesPerRequest: null on its connections.
      const queueConnection = new Redis(url, { maxRetriesPerRequest: null });
      const workerConnection = new Redis(url, { maxRetriesPerRequest: null });
      this.connections = [queueConnection, workerConnection];

      this.queue = new Queue<DocumentParseJobData>(QUEUE_NAME, {
        connection: queueConnection,
        defaultJobOptions: {
          removeOnComplete: { age: JOB_KEEP_MS },
          removeOnFail: { age: JOB_KEEP_MS },
        },
      });
      this.worker = new Worker<DocumentParseJobData>(
        QUEUE_NAME,
        async (job) => this.processJob(job.data),
        { connection: workerConnection, concurrency: WORKER_CONCURRENCY },
      );
      this.worker.on('failed', (job, error) => {
        this.logger.warn(
          `document parse job ${job?.data.jobId ?? '?'} failed: ${error.message}`,
        );
      });
      this.logger.log('Document parse queue connected to Redis');
    } catch (error) {
      this.logger.error(
        `Failed to initialize document parse queue, falling back to in-process: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.closeQueues();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeQueues();
  }

  isQueueBacked(): boolean {
    return this.queue !== null;
  }

  async enqueue(
    file: Express.Multer.File,
    options: {
      fileType: FileType;
      language?: string;
      minKeywordLength?: number;
      maxKeywords?: number;
      withPhrases?: boolean;
    },
    userId: number,
  ): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    const data: DocumentParseJobData = {
      jobId,
      userId,
      originalName: file.originalname,
      fileType: options.fileType,
      fileSize: file.size,
      mimetype: file.mimetype,
      language: options.language,
      minKeywordLength: options.minKeywordLength,
      maxKeywords: options.maxKeywords,
      withPhrases: options.withPhrases ?? false,
      fileBase64: file.buffer.toString('base64'),
    };

    if (this.queue) {
      await this.queue.add('parse', data, { jobId });
    } else {
      this.memoryJobs.set(jobId, { jobId, userId, status: 'queued' });
      // Fire-and-forget: the HTTP request returns immediately while the
      // parse continues in the background of this process.
      void this.processJob(data).catch(() => undefined);
    }

    return { jobId };
  }

  async getStatus(
    jobId: string,
    userId: number,
  ): Promise<DocumentParseJobState | null> {
    if (this.queue) {
      const job = await this.queue.getJob(jobId);
      if (!job || job.data.userId !== userId) {
        return null;
      }

      if (await job.isCompleted()) {
        // processJob always resolves with a state object (failures included),
        // so the returnvalue carries the full status.
        const state = job.returnvalue as DocumentParseJobState | undefined;
        return (
          state ?? {
            jobId,
            userId,
            status: 'failed',
            error: 'Missing parse result',
          }
        );
      }
      if (await job.isFailed()) {
        return {
          jobId,
          userId,
          status: 'failed',
          error: job.failedReason ?? 'Document parsing failed',
        };
      }
      return {
        jobId,
        userId,
        status: (await job.isActive()) ? 'active' : 'queued',
      };
    }

    const state = this.memoryJobs.get(jobId);
    if (!state || state.userId !== userId) {
      return null;
    }
    return state;
  }

  async processJob(data: DocumentParseJobData): Promise<DocumentParseJobState> {
    const complete = (state: DocumentParseJobState) => {
      if (!this.queue) {
        this.memoryJobs.set(data.jobId, state);
      }
      return state;
    };

    try {
      const buffer = Buffer.from(data.fileBase64, 'base64');
      const file: Express.Multer.File = {
        buffer,
        originalname: data.originalName,
        size: data.fileSize,
        mimetype: data.mimetype,
      } as Express.Multer.File;

      const result = data.withPhrases
        ? await this.documentImportService.importDocumentWithPhrases(file, {
            fileType: data.fileType,
            language: data.language,
            minKeywordLength: data.minKeywordLength,
            maxKeywords: data.maxKeywords,
          })
        : await this.documentImportService.importDocument(file, {
            fileType: data.fileType,
            language: data.language,
            minKeywordLength: data.minKeywordLength,
            maxKeywords: data.maxKeywords,
          });

      return complete({
        jobId: data.jobId,
        userId: data.userId,
        status: 'completed',
        result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`document parse job ${data.jobId} failed: ${message}`);
      return complete({
        jobId: data.jobId,
        userId: data.userId,
        status: 'failed',
        error: message,
      });
    }
  }

  private async closeQueues(): Promise<void> {
    try {
      await this.worker?.close();
      await this.queue?.close();
      for (const connection of this.connections) {
        connection.disconnect();
      }
    } finally {
      this.worker = null;
      this.queue = null;
      this.connections = [];
    }
  }
}
