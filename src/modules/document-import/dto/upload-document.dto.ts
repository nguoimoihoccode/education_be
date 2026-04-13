import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsNumber, Min, Max } from 'class-validator';

export enum FileType {
  PDF = 'pdf',
  DOCX = 'docx',
  DOC = 'doc',
  XLSX = 'xlsx',
  XLS = 'xls',
  JSON = 'json',
  TXT = 'txt',
}

export class UploadDocumentDto {
  @ApiProperty({
    description: 'Type of the file being uploaded',
    enum: FileType,
    example: FileType.PDF,
  })
  @IsEnum(FileType)
  fileType: FileType;

  @ApiProperty({
    description: 'Language code for keyword extraction (e.g., en, vi, ja)',
    example: 'en',
    required: false,
  })
  @IsOptional()
  language?: string;

  @ApiProperty({
    description: 'Minimum keyword length',
    example: 3,
    required: false,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  minKeywordLength?: number;

  @ApiProperty({
    description: 'Maximum number of keywords to extract',
    example: 100,
    required: false,
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  maxKeywords?: number;
}
