import { DocumentParseQueueService } from './document-parse-queue.service';

const createConfigService = (redisUrl?: string) =>
  ({
    get: jest.fn((key: string) => (key === 'REDIS_URL' ? redisUrl : undefined)),
  }) as never;

const createDocumentImportService = (overrides: Record<string, unknown> = {}) =>
  ({
    importDocument: jest
      .fn()
      .mockResolvedValue({ id: 'result-1', keywordCount: 3 }),
    importDocumentWithPhrases: jest
      .fn()
      .mockResolvedValue({ id: 'result-2', phrases: ['a b'] }),
    ...overrides,
  }) as never;

const createFile = (): Express.Multer.File =>
  ({
    buffer: Buffer.from('hello world'),
    originalname: 'doc.txt',
    size: 11,
    mimetype: 'text/plain',
  }) as Express.Multer.File;

describe('DocumentParseQueueService (in-process fallback)', () => {
  const createService = (
    documentImportService: Record<string, unknown> = {},
  ) => {
    const service = new DocumentParseQueueService(
      createDocumentImportService(documentImportService),
      createConfigService(undefined),
    );
    return { service };
  };

  it('runs without redis when REDIS_URL is not set', async () => {
    const { service } = createService();
    await service.onModuleInit();
    expect(service.isQueueBacked()).toBe(false);
    await service.onModuleDestroy();
  });

  it('parses off the request path and exposes the completed state', async () => {
    const { service } = createService();
    await service.onModuleInit();

    const { jobId } = await service.enqueue(
      createFile(),
      { fileType: 'txt' },
      7,
    );

    // Let the fire-and-forget parse settle.
    await new Promise((resolve) => setImmediate(resolve));

    const state = await service.getStatus(jobId, 7);
    expect(state).toMatchObject({ jobId, status: 'completed' });
    expect((state!.result as { id: string }).id).toBe('result-1');
    await service.onModuleDestroy();
  });

  it('uses the phrase variant when withPhrases is set', async () => {
    const documentImportService = {
      importDocument: jest.fn(),
      importDocumentWithPhrases: jest
        .fn()
        .mockResolvedValue({ id: 'result-2', phrases: ['a b'] }),
    };
    const { service } = createService(documentImportService);
    await service.onModuleInit();

    const { jobId } = await service.enqueue(
      createFile(),
      { fileType: 'txt', withPhrases: true },
      7,
    );
    await new Promise((resolve) => setImmediate(resolve));

    const state = await service.getStatus(jobId, 7);
    expect(state!.status).toBe('completed');
    expect(documentImportService.importDocumentWithPhrases).toHaveBeenCalled();
    expect(documentImportService.importDocument).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });

  it('records a failed state when parsing throws', async () => {
    const { service } = createService({
      importDocument: jest.fn().mockRejectedValue(new Error('bad document')),
    });
    await service.onModuleInit();

    const { jobId } = await service.enqueue(
      createFile(),
      { fileType: 'txt' },
      7,
    );
    await new Promise((resolve) => setImmediate(resolve));

    const state = await service.getStatus(jobId, 7);
    expect(state).toMatchObject({
      jobId,
      status: 'failed',
      error: 'bad document',
    });
    await service.onModuleDestroy();
  });

  it('only lets the owning user read a job status', async () => {
    const { service } = createService();
    await service.onModuleInit();

    const { jobId } = await service.enqueue(
      createFile(),
      { fileType: 'txt' },
      7,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(await service.getStatus(jobId, 99)).toBeNull();
    expect(await service.getStatus('missing', 7)).toBeNull();
    await service.onModuleDestroy();
  });
});
