import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { decryptSecret, encryptSecret } from './ai-crypto.util';
import { UpdateEmbeddingSettingsDto } from './dto/update-embedding-settings.dto';
import { AiEmbeddingSettings } from './entities/ai-embedding-settings.entity';

type FetchLike = typeof fetch;

export const AI_EMBEDDING_CLIENT = 'AI_EMBEDDING_CLIENT';

/**
 * Built-in defaults point at OpenAI, the reference implementation of the
 * OpenAI-compatible embeddings API. They are only a fallback — the chat provider
 * cannot serve this, so production is expected to configure one explicitly.
 */
export const DEFAULT_EMBEDDING_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

/**
 * Inputs per HTTP request. Providers cap how many inputs one call may carry, and
 * a single request for a whole lesson would be rejected rather than slow.
 */
export const EMBED_BATCH_SIZE = 64;

type ConfigSource = 'db' | 'env' | 'default';

export interface EmbeddingConfig {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  dimensions: number;
  source: {
    baseUrl: ConfigSource;
    apiKey: ConfigSource;
    model: ConfigSource;
    dimensions: ConfigSource;
  };
}

interface EmbeddingsResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
}

@Injectable()
export class EmbeddingService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiEmbeddingSettings)
    private readonly settingsRepo: Repository<AiEmbeddingSettings>,
    @Optional()
    @Inject(AI_EMBEDDING_CLIENT)
    private readonly fetchClient: FetchLike = fetch,
  ) {}

  private isUnset(value: unknown): boolean {
    return value === null || value === undefined || value === '';
  }

  /** Same precedence as the chat provider: DB row, then env, then built-in. */
  async resolveConfig(): Promise<EmbeddingConfig> {
    const rows = await this.settingsRepo.find({ take: 1 });
    const row = rows[0];

    const encKey = this.configService.get<string>('AI_SETTINGS_ENCRYPTION_KEY');
    const envApiKey = this.configService.get<string>('EMBEDDING_API_KEY');
    const envBaseUrl = this.configService.get<string>('EMBEDDING_BASE_URL');
    const envModel = this.configService.get<string>('EMBEDDING_MODEL');
    const envDimensions = this.configService.get<number>(
      'EMBEDDING_DIMENSIONS',
    );

    let apiKey: string | undefined;
    let apiKeySource: ConfigSource = 'default';
    if (row && !this.isUnset(row.apiKeyEncrypted) && encKey) {
      try {
        apiKey = decryptSecret(row.apiKeyEncrypted!, encKey);
        apiKeySource = 'db';
      } catch {
        // An unreadable secret must not take the whole feature down; it just
        // means this row cannot be used, and the caller reports "not configured".
        apiKey = undefined;
        apiKeySource = 'default';
      }
    }
    if (!apiKey) {
      if (!this.isUnset(envApiKey)) {
        apiKey = envApiKey;
        apiKeySource = 'env';
      } else {
        apiKey = undefined;
        apiKeySource = 'default';
      }
    }

    let baseUrl: string;
    let baseUrlSource: ConfigSource;
    if (row && !this.isUnset(row.baseUrl)) {
      baseUrl = row.baseUrl!;
      baseUrlSource = 'db';
    } else if (!this.isUnset(envBaseUrl)) {
      baseUrl = envBaseUrl!;
      baseUrlSource = 'env';
    } else {
      baseUrl = DEFAULT_EMBEDDING_BASE_URL;
      baseUrlSource = 'default';
    }

    let model: string;
    let modelSource: ConfigSource;
    if (row && !this.isUnset(row.model)) {
      model = row.model!;
      modelSource = 'db';
    } else if (!this.isUnset(envModel)) {
      model = envModel!;
      modelSource = 'env';
    } else {
      model = DEFAULT_EMBEDDING_MODEL;
      modelSource = 'default';
    }

    let dimensions: number;
    let dimensionsSource: ConfigSource;
    if (row && row.dimensions !== null && row.dimensions !== undefined) {
      dimensions = row.dimensions;
      dimensionsSource = 'db';
    } else if (envDimensions !== null && envDimensions !== undefined) {
      dimensions = Number(envDimensions);
      dimensionsSource = 'env';
    } else {
      dimensions = DEFAULT_EMBEDDING_DIMENSIONS;
      dimensionsSource = 'default';
    }

    return {
      apiKey,
      baseUrl,
      model,
      dimensions,
      source: {
        baseUrl: baseUrlSource,
        apiKey: apiKeySource,
        model: modelSource,
        dimensions: dimensionsSource,
      },
    };
  }

  isConfigured(): Promise<boolean> {
    return this.resolveConfig().then((config) => Boolean(config.apiKey));
  }

  /**
   * Embed every input, in order. Batches are sequential on purpose: the index
   * cron and the admin reindex are the only callers, and hammering a provider in
   * parallel is how a reindex gets rate-limited halfway through.
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const config = await this.resolveConfig();
    if (!config.apiKey) {
      throw new ServiceUnavailableException(
        'Embedding provider is not configured',
      );
    }

    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
      const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
      vectors.push(...(await this.embedBatch(batch, config)));
    }
    return vectors;
  }

  async embedOne(text: string): Promise<number[]> {
    const [vector] = await this.embed([text]);
    return vector;
  }

  private async embedBatch(
    input: string[],
    config: EmbeddingConfig,
  ): Promise<number[][]> {
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchClient(`${config.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: config.model, input }),
      });
    } catch {
      throw new ServiceUnavailableException('Embedding provider unavailable');
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Embedding provider returned status ${response.status}`,
      );
    }

    let body: EmbeddingsResponse;
    try {
      body = (await response.json()) as EmbeddingsResponse;
    } catch {
      throw new ServiceUnavailableException(
        'Embedding provider returned an unreadable response',
      );
    }

    const rows = body.data ?? [];
    if (rows.length !== input.length) {
      throw new ServiceUnavailableException(
        `Embedding provider returned ${rows.length} vectors for ${input.length} inputs`,
      );
    }

    // The API gives each vector an explicit index and does not promise the array
    // is ordered, so every vector is placed by its index rather than by position.
    const ordered: number[][] = new Array(input.length);
    rows.forEach((row, position) => {
      const target = row.index ?? position;
      if (!Array.isArray(row.embedding)) {
        throw new ServiceUnavailableException(
          'Embedding provider returned an empty vector',
        );
      }
      ordered[target] = row.embedding;
    });

    ordered.forEach((vector, position) => {
      if (!vector) {
        throw new ServiceUnavailableException(
          `Embedding provider skipped input ${position}`,
        );
      }
      // A width mismatch is a misconfiguration, and here it is one clear message.
      // Left alone it would surface as an opaque SQL error when a wrong-width
      // vector is written into a `vector(N)` column.
      if (vector.length !== config.dimensions) {
        throw new ServiceUnavailableException(
          `Embedding model "${config.model}" returned ${vector.length} dimensions but ${config.dimensions} are configured`,
        );
      }
    });

    return ordered;
  }

  /** View for the admin settings endpoint, shaped like the chat provider's. */
  async getConfigView() {
    const effective = await this.resolveConfig();
    const rows = await this.settingsRepo.find({ take: 1 });
    const row = rows[0];
    const envKey = this.configService.get<string>('EMBEDDING_API_KEY');

    let apiKeyLast4: string | null = null;
    if (row?.apiKeyLast4) {
      apiKeyLast4 = row.apiKeyLast4;
    } else if (envKey) {
      apiKeyLast4 = envKey.slice(-4);
    }

    return {
      baseUrl: effective.baseUrl,
      model: effective.model,
      dimensions: effective.dimensions,
      apiKeyConfigured: Boolean(effective.apiKey),
      apiKeyLast4,
      source: effective.source,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  /** Writes the embedding block of `PUT /ai/settings`. */
  async applySettings(
    userId: number,
    dto: UpdateEmbeddingSettingsDto,
  ): Promise<void> {
    const rows = await this.settingsRepo.find({ take: 1 });
    let row = rows[0];
    if (!row) {
      row = this.settingsRepo.create({});
    }

    if (dto.clearApiKey) {
      row.apiKeyEncrypted = null;
      row.apiKeyLast4 = null;
    }
    if (dto.clearBaseUrl) {
      row.baseUrl = null;
    }
    if (dto.clearModel) {
      row.model = null;
    }
    if (dto.clearDimensions) {
      row.dimensions = null;
    }

    if (dto.baseUrl !== undefined) {
      row.baseUrl = dto.baseUrl;
    }
    if (dto.model !== undefined) {
      row.model = dto.model;
    }
    if (dto.dimensions !== undefined) {
      row.dimensions = dto.dimensions;
    }

    if (dto.apiKey !== undefined) {
      const encKey = this.configService.get<string>(
        'AI_SETTINGS_ENCRYPTION_KEY',
      );
      if (!encKey) {
        throw new ServiceUnavailableException(
          'AI settings encryption is not configured',
        );
      }
      row.apiKeyEncrypted = encryptSecret(dto.apiKey, encKey);
      row.apiKeyLast4 = dto.apiKey.slice(-4);
    }

    row.updatedByUserId = userId;
    await this.settingsRepo.save(row);
  }
}
