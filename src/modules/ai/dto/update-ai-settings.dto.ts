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
}
