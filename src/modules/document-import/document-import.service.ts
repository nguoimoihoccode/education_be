import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DocumentTextExtractionService } from './document-text-extraction.service';
import { KeywordExtractionService } from './keyword-extraction.service';
import { DocumentImportResponseDto } from './dto/document-import-response.dto';
import { FileType } from './dto/upload-document.dto';

interface ImportOptions {
  fileType: FileType;
  language?: string;
  minKeywordLength?: number;
  maxKeywords?: number;
}

@Injectable()
export class DocumentImportService {
  constructor(
    private readonly textExtractionService: DocumentTextExtractionService,
    private readonly keywordExtractionService: KeywordExtractionService,
  ) {}

  async importDocument(
    file: Express.Multer.File,
    options: ImportOptions,
  ): Promise<DocumentImportResponseDto> {
    const startTime = Date.now();

    // Extract text from document
    const extractedText = await this.textExtractionService.extractText(
      file.buffer,
      options.fileType,
      file.originalname,
    );

    // Extract keywords from text
    const keywords = this.keywordExtractionService.extractKeywords(
      extractedText,
      {
        language: options.language,
        minKeywordLength: options.minKeywordLength,
        maxKeywords: options.maxKeywords,
      },
    );

    const processingTime = Date.now() - startTime;

    return {
      id: randomUUID(),
      originalName: file.originalname,
      fileType: options.fileType,
      fileSize: file.size,
      textLength: extractedText.length,
      keywordCount: keywords.length,
      keywords,
      processingTime,
      processedAt: new Date().toISOString(),
    };
  }

  async importDocumentWithPhrases(
    file: Express.Multer.File,
    options: ImportOptions,
  ): Promise<DocumentImportResponseDto & { phrases: string[] }> {
    const startTime = Date.now();

    // Extract text from document
    const extractedText = await this.textExtractionService.extractText(
      file.buffer,
      options.fileType,
      file.originalname,
    );

    // Extract keywords from text
    const keywords = this.keywordExtractionService.extractKeywords(
      extractedText,
      {
        language: options.language,
        minKeywordLength: options.minKeywordLength,
        maxKeywords: options.maxKeywords,
      },
    );

    // Extract phrases from text
    const phrases = this.keywordExtractionService.extractPhrases(
      extractedText,
      {
        maxKeywords: options.maxKeywords,
      },
    );

    const processingTime = Date.now() - startTime;

    return {
      id: randomUUID(),
      originalName: file.originalname,
      fileType: options.fileType,
      fileSize: file.size,
      textLength: extractedText.length,
      keywordCount: keywords.length,
      keywords,
      phrases,
      processingTime,
      processedAt: new Date().toISOString(),
    };
  }

  getSupportedFileTypes(): FileType[] {
    return this.textExtractionService.getSupportedFileTypes();
  }
}
