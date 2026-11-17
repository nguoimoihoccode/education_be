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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateEmbeddingSettingsDto } from './update-embedding-settings.dto';

export class UpdateAiSettingsDto {
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

  @IsOptional()
  @IsNumber()
  @Min(64)
  @Max(4096)
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  systemRules?: string;

  /** USD per million prompt tokens, e.g. 0.59. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  inputPriceUsdPerMillion?: number;

  /** USD per million completion tokens, e.g. 0.79. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  outputPriceUsdPerMillion?: number;

  @IsOptional()
  @IsBoolean()
  clearPricing?: boolean;

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
  clearMaxTokens?: boolean;

  @IsOptional()
  @IsBoolean()
  clearTemperature?: boolean;

  @IsOptional()
  @IsBoolean()
  clearSystemRules?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEmbeddingSettingsDto)
  embedding?: UpdateEmbeddingSettingsDto;
}
