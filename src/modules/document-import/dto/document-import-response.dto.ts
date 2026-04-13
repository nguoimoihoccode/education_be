import { ApiProperty } from '@nestjs/swagger';

export class KeywordDto {
  @ApiProperty({
    description: 'The extracted keyword',
    example: 'artificial intelligence',
  })
  keyword: string;

  @ApiProperty({
    description: 'Frequency of the keyword in the document',
    example: 15,
  })
  frequency: number;

  @ApiProperty({
    description: 'Context where the keyword appears',
    example: 'artificial intelligence is transforming modern technology',
    required: false,
  })
  context?: string;
}

export class DocumentImportResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the import operation',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Original filename',
    example: 'research_paper.pdf',
  })
  originalName: string;

  @ApiProperty({
    description: 'File type',
    example: 'pdf',
  })
  fileType: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1024000,
  })
  fileSize: number;

  @ApiProperty({
    description: 'Extracted text length',
    example: 5000,
  })
  textLength: number;

  @ApiProperty({
    description: 'Number of keywords extracted',
    example: 45,
  })
  keywordCount: number;

  @ApiProperty({
    description: 'Extracted keywords',
    type: [KeywordDto],
  })
  keywords: KeywordDto[];

  @ApiProperty({
    description: 'Processing time in milliseconds',
    example: 1250,
  })
  processingTime: number;

  @ApiProperty({
    description: 'Timestamp when the import was processed',
    example: '2024-01-15T10:30:00Z',
  })
  processedAt: string;
}
