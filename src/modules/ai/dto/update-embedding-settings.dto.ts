import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Embedding provider settings. Kept separate from the chat provider's because
 * the default chat provider (Groq) exposes no embeddings endpoint at all, so the
 * two cannot be the same configuration.
 */
export class UpdateEmbeddingSettingsDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(512)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;

  /**
   * Width of the vectors the model returns. It must match the `embedding` column,
   * so changing it is not a config tweak: the corpus has to be re-embedded and the
   * column altered to the new width.
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8192)
  dimensions?: number;

  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;

  @IsOptional()
  @IsBoolean()
  clearBaseUrl?: boolean;

  @IsOptional()
  @IsBoolean()
  clearModel?: boolean;

  @IsOptional()
  @IsBoolean()
  clearDimensions?: boolean;
}
