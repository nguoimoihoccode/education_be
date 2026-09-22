import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { encryptSecret } from './ai-crypto.util';
import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  EMBED_BATCH_SIZE,
  EmbeddingService,
} from './embedding.service';
import { AiEmbeddingSettings } from './entities/ai-embedding-settings.entity';

const ENC_KEY = Buffer.alloc(32, 7).toString('base64');
const WIDTH = 1536;

const vector = (fill: number, width = WIDTH): number[] =>
  Array.from({ length: width }, () => fill);

const okResponse = (vectors: number[][], indices?: number[]) =>
  ({
    ok: true,
    json: async () => ({
      data: vectors.map((embedding, i) => ({
        embedding,
        index: indices ? indices[i] : i,
      })),
    }),
  }) as unknown as Response;

describe('EmbeddingService', () => {
  let settingsRepo: jest.Mocked<
    Pick<Repository<AiEmbeddingSettings>, 'find' | 'create' | 'save'>
  >;
  let fetchMock: jest.Mock;
  let env: Record<string, unknown>;
  let service: EmbeddingService;

  const build = () => {
    const configService = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    service = new EmbeddingService(
      configService,
      settingsRepo as unknown as Repository<AiEmbeddingSettings>,
      fetchMock as unknown as typeof fetch,
    );
  };

  beforeEach(() => {
    settingsRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
    };
    fetchMock = jest
      .fn()
      .mockImplementation(async (_url: string, init: { body: string }) => {
        const { input } = JSON.parse(init.body);
        return okResponse(input.map(() => vector(0.1)));
      });
    env = { AI_SETTINGS_ENCRYPTION_KEY: ENC_KEY };
    build();
  });

  const row = (overrides: Partial<AiEmbeddingSettings> = {}) =>
    ({
      id: 'row-1',
      baseUrl: null,
      apiKeyEncrypted: null,
      apiKeyLast4: null,
      model: null,
      dimensions: null,
      ...overrides,
    }) as AiEmbeddingSettings;

  describe('configuration precedence', () => {
    it('falls back to the built-in defaults when nothing is set', async () => {
      const config = await service.resolveConfig();

      expect(config.baseUrl).toBe('https://api.openai.com/v1');
      expect(config.model).toBe('text-embedding-3-small');
      expect(config.dimensions).toBe(DEFAULT_EMBEDDING_DIMENSIONS);
      expect(config.apiKey).toBeUndefined();
      expect(config.source).toEqual({
        baseUrl: 'default',
        apiKey: 'default',
        model: 'default',
        dimensions: 'default',
      });
    });

    it('prefers environment variables over the defaults', async () => {
      env.EMBEDDING_BASE_URL = 'https://env.example/v1';
      env.EMBEDDING_MODEL = 'env-model';
      env.EMBEDDING_DIMENSIONS = 768;
      env.EMBEDDING_API_KEY = 'env-key-12345678';

      const config = await service.resolveConfig();

      expect(config.baseUrl).toBe('https://env.example/v1');
      expect(config.model).toBe('env-model');
      expect(config.dimensions).toBe(768);
      expect(config.apiKey).toBe('env-key-12345678');
      expect(config.source.baseUrl).toBe('env');
      expect(config.source.apiKey).toBe('env');
    });

    it('prefers the database row over the environment', async () => {
      env.EMBEDDING_BASE_URL = 'https://env.example/v1';
      env.EMBEDDING_MODEL = 'env-model';
      env.EMBEDDING_API_KEY = 'env-key-12345678';
      settingsRepo.find.mockResolvedValue([
        row({
          baseUrl: 'https://db.example/v1',
          model: 'db-model',
          dimensions: 1024,
          apiKeyEncrypted: encryptSecret('db-key-12345678', ENC_KEY),
          apiKeyLast4: '5678',
        }),
      ]);

      const config = await service.resolveConfig();

      expect(config.baseUrl).toBe('https://db.example/v1');
      expect(config.model).toBe('db-model');
      expect(config.dimensions).toBe(1024);
      expect(config.apiKey).toBe('db-key-12345678');
      expect(config.source.model).toBe('db');
    });

    // A row encrypted under a key that has since rotated must not take the whole
    // feature down — the env fallback is still usable.
    it('falls back to the environment when the stored key cannot be decrypted', async () => {
      env.EMBEDDING_API_KEY = 'env-key-12345678';
      settingsRepo.find.mockResolvedValue([
        row({ apiKeyEncrypted: 'not:a:valid-sealed-secret' }),
      ]);

      const config = await service.resolveConfig();

      expect(config.apiKey).toBe('env-key-12345678');
      expect(config.source.apiKey).toBe('env');
    });
  });

  describe('embed', () => {
    it('refuses to call the provider when no key is configured', async () => {
      await expect(service.embed(['hello'])).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.embed(['hello'])).rejects.toThrow(
        'Embedding provider is not configured',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends the configured model and inputs to the embeddings endpoint', async () => {
      env.EMBEDDING_API_KEY = 'env-key-12345678';
      env.EMBEDDING_BASE_URL = 'https://emb.example/v1';
      env.EMBEDDING_MODEL = 'my-model';

      await service.embed(['một', 'hai']);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://emb.example/v1/embeddings');
      expect(init.headers.Authorization).toBe('Bearer env-key-12345678');
      expect(JSON.parse(init.body)).toEqual({
        model: 'my-model',
        input: ['một', 'hai'],
      });
    });

    it('makes no request at all for an empty input list', async () => {
      env.EMBEDDING_API_KEY = 'env-key-12345678';

      expect(await service.embed([])).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // Providers are not obliged to return the vectors in request order; trusting
    // array position would silently attach the wrong vector to the wrong chunk.
    it('orders vectors by their index rather than by array position', async () => {
      env.EMBEDDING_API_KEY = 'env-key-12345678';
      fetchMock.mockResolvedValue(
        okResponse([vector(0.3), vector(0.2), vector(0.1)], [2, 1, 0]),
      );

      const result = await service.embed(['a', 'b', 'c']);

      expect(result[0][0]).toBe(0.1);
      expect(result[1][0]).toBe(0.2);
      expect(result[2][0]).toBe(0.3);
    });

    it('splits a large input list across several requests', async () => {
      env.EMBEDDING_API_KEY = 'env-key-12345678';
      const texts = Array.from(
        { length: EMBED_BATCH_SIZE + 1 },
        (_, i) => `t${i}`,
      );
      fetchMock.mockImplementation(
        async (_url: string, init: { body: string }) => {
          const { input } = JSON.parse(init.body);
          return okResponse(input.map(() => vector(0.5)));
        },
      );

      const result = await service.embed(texts);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(EMBED_BATCH_SIZE + 1);
    });

    it('rejects a response with the wrong number of vectors', async () => {
      env.EMBEDDING_API_KEY = 'env-key-12345678';
      fetchMock.mockResolvedValue(okResponse([vector(0.1)]));

      await expect(service.embed(['a', 'b'])).rejects.toThrow(
        'returned 1 vectors for 2 inputs',
      );
    });

    // Otherwise this surfaces much later as an opaque SQL error from a vector(N)
    // column, far from the misconfiguration that caused it.
    it('rejects a vector whose width does not match the configuration', async () => {
      env.EMBEDDING_API_KEY = 'env-key-12345678';
      env.EMBEDDING_DIMENSIONS = 1536;
      fetchMock.mockResolvedValue(okResponse([vector(0.1, 768)]));

      await expect(service.embed(['a'])).rejects.toThrow(
        'returned 768 dimensions but 1536 are configured',
      );
    });

    it('wraps a provider error status', async () => {
      env.EMBEDDING_API_KEY = 'env-key-12345678';
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
      } as unknown as Response);

      await expect(service.embed(['a'])).rejects.toThrow(
        'Embedding provider returned status 429',
      );
    });

    it('wraps a transport failure', async () => {
      env.EMBEDDING_API_KEY = 'env-key-12345678';
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.embed(['a'])).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('applySettings', () => {
    it('encrypts the key and keeps only its last four characters', async () => {
      await service.applySettings(7, { apiKey: 'sk-super-secret-abcd' });

      const saved = settingsRepo.save.mock.calls[0][0] as AiEmbeddingSettings;
      expect(saved.apiKeyLast4).toBe('abcd');
      expect(saved.apiKeyEncrypted).not.toContain('super-secret');
      expect(saved.updatedByUserId).toBe(7);
    });

    it('refuses to store a key when encryption is not configured', async () => {
      env = {};

      await expect(
        service.applySettings(7, { apiKey: 'sk-super-secret-abcd' }),
      ).rejects.toThrow('AI settings encryption is not configured');
    });

    it('reports whether an embedding provider is usable at all', async () => {
      expect(await service.isConfigured()).toBe(false);

      env.EMBEDDING_API_KEY = 'env-key-12345678';
      build();

      expect(await service.isConfigured()).toBe(true);
    });
  });
});
