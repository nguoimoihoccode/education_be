import {
  Controller,
  BadRequestException,
  Get,
  HttpCode,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentImportService } from './document-import.service';
import { DocumentImportResponseDto } from './dto/document-import-response.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { FileType } from './dto/upload-document.dto';

// New imports
import {
  DocumentConversionRequestDto,
  DocumentConversionResponseDto,
} from './dto/document-conversion.dto';
import {
  ContentType,
  DocumentStructureType,
} from './dto/document-conversion.dto';
import type { RequestWithUser } from '../../common/types/auth.types';
import { DocumentConversionService } from './document-conversion.service';
import { DocumentTextExtractionService } from './document-text-extraction.service';
import { DocumentPreviewService } from './document-preview.service';
import {
  ConfirmDocumentImportDto,
  DocumentPreviewRequestDto,
} from './dto/document-preview.dto';
import {
  ExpensiveActionRateLimit,
  UploadRateLimit,
} from '../../common/decorators/rate-limit.decorator';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/json',
  'text/plain',
]);

@ApiTags('Document Import')
@ApiBearerAuth('JWT-auth')
@Controller('document-import')
export class DocumentImportController {
  constructor(
    private readonly documentImportService: DocumentImportService,
    private readonly documentConversionService: DocumentConversionService,
    private readonly documentTextExtractionService: DocumentTextExtractionService,
    private readonly documentPreviewService: DocumentPreviewService,
  ) {}

  private getUserId(req: RequestWithUser): number {
    const userId = req.user?.sub;
    if (!userId) {
      throw new Error('User not authenticated');
    }
    return userId;
  }

  @Post('upload')
  @UploadRateLimit()
  @ApiOperation({
    summary: 'Import document and extract keywords',
    description:
      'Upload a document (PDF, DOCX, XLSX, JSON, TXT) and extract keywords from its content',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file to import',
        },
        fileType: {
          type: 'string',
          enum: Object.values(FileType),
          description: 'Type of the file being uploaded',
        },
        language: {
          type: 'string',
          description:
            'Language code for keyword extraction (e.g., en, vi, ja)',
        },
        minKeywordLength: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          description: 'Minimum keyword length',
        },
        maxKeywords: {
          type: 'number',
          minimum: 1,
          maximum: 500,
          description: 'Maximum number of keywords to extract',
        },
      },
      required: ['file', 'fileType'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Document imported successfully',
    type: DocumentImportResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file or parameters',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_FILE_SIZE,
      },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
          return cb(
            new BadRequestException(
              `Unsupported file type: ${file.mimetype}. Allowed types: ${Array.from(
                ALLOWED_MIME_TYPES,
              ).join(', ')}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadDocument(
    @UploadedFile() file?: Express.Multer.File,
    @Body() uploadDto?: UploadDocumentDto,
  ): Promise<DocumentImportResponseDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!uploadDto || !uploadDto.fileType) {
      throw new BadRequestException('fileType is required');
    }

    return this.documentImportService.importDocument(file, {
      fileType: uploadDto.fileType,
      language: uploadDto.language,
      minKeywordLength: uploadDto.minKeywordLength,
      maxKeywords: uploadDto.maxKeywords,
    });
  }

  @Post('upload-with-phrases')
  @UploadRateLimit()
  @ApiOperation({
    summary: 'Import document and extract keywords with phrases',
    description:
      'Upload a document and extract both keywords and common phrases from its content',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file to import',
        },
        fileType: {
          type: 'string',
          enum: Object.values(FileType),
          description: 'Type of the file being uploaded',
        },
        language: {
          type: 'string',
          description:
            'Language code for keyword extraction (e.g., en, vi, ja)',
        },
        minKeywordLength: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          description: 'Minimum keyword length',
        },
        maxKeywords: {
          type: 'number',
          minimum: 1,
          maximum: 500,
          description: 'Maximum number of keywords to extract',
        },
      },
      required: ['file', 'fileType'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Document imported successfully with phrases',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_FILE_SIZE,
      },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
          return cb(
            new BadRequestException(
              `Unsupported file type: ${file.mimetype}. Allowed types: ${Array.from(
                ALLOWED_MIME_TYPES,
              ).join(', ')}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadDocumentWithPhrases(
    @UploadedFile() file?: Express.Multer.File,
    @Body() uploadDto?: UploadDocumentDto,
  ): Promise<DocumentImportResponseDto & { phrases: string[] }> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!uploadDto || !uploadDto.fileType) {
      throw new BadRequestException('fileType is required');
    }

    return this.documentImportService.importDocumentWithPhrases(file, {
      fileType: uploadDto.fileType,
      language: uploadDto.language,
      minKeywordLength: uploadDto.minKeywordLength,
      maxKeywords: uploadDto.maxKeywords,
    });
  }

  @Get('supported-types')
  @ApiOperation({
    summary: 'Get supported file types',
    description: 'Returns list of supported file types for document import',
  })
  @ApiResponse({
    status: 200,
    description: 'List of supported file types',
    schema: {
      type: 'array',
      items: {
        type: 'string',
        enum: Object.values(FileType),
      },
    },
  })
  getSupportedTypes(): FileType[] {
    return this.documentImportService.getSupportedFileTypes();
  }

  @Post('preview')
  @ExpensiveActionRateLimit()
  @ApiOperation({
    summary: 'Preview document import without creating content',
    description:
      'Upload a document and return suggested flashcards without writing to the database',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
          return cb(
            new BadRequestException(`Unsupported file type: ${file.mimetype}`),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @HttpCode(200)
  async previewDocument(
    @UploadedFile() file?: Express.Multer.File,
    @Body() dto?: DocumentPreviewRequestDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    let fileType = this.documentTextExtractionService.getFileTypeFromExtension(
      file.originalname,
    );
    if (!fileType) {
      fileType = this.documentTextExtractionService.getFileTypeFromMimeType(
        file.mimetype,
      );
    }
    if (!fileType) {
      throw new BadRequestException('Unsupported file type');
    }

    return this.documentPreviewService.previewDocument(
      file.buffer,
      fileType,
      file.originalname,
      dto ?? {},
    );
  }

  @Post('confirm')
  @ApiOperation({
    summary: 'Confirm selected document preview cards and create flashcards',
  })
  @HttpCode(200)
  async confirmDocumentImport(
    @Req() req: RequestWithUser,
    @Body() dto: ConfirmDocumentImportDto,
  ) {
    const userId = this.getUserId(req);
    return this.documentPreviewService.confirmImport(userId, dto);
  }

  @Post('convert')
  @ExpensiveActionRateLimit()
  @ApiOperation({
    summary: 'Convert document to educational content',
    description:
      'Upload a document and automatically generate flashcards, vocabulary, lessons, and/or quizzes from its content',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file to convert',
        },
        fileType: {
          type: 'string',
          enum: Object.values(FileType),
          description: 'Type of the file being uploaded (can be auto-detected)',
        },
        contentTypes: {
          type: 'array',
          items: { type: 'string', enum: Object.values(ContentType) },
          description: 'Which types of educational content to generate',
        },
        structureType: {
          type: 'string',
          enum: Object.values(DocumentStructureType),
          description:
            'Document structure type (optional, auto-detected if not provided)',
        },
        topic: {
          type: 'string',
          description: 'Manual topic override (e.g., HSK1, HSK2)',
        },
        autoDetectTopic: {
          type: 'boolean',
          description:
            'Whether to auto-detect topic from content (default true)',
        },
        language: {
          type: 'string',
          description: 'Language code (en, vi, ja, zh)',
        },
        deckName: {
          type: 'string',
          description: 'Name for generated flashcard deck',
        },
        deckColor: { type: 'string', description: 'Color for deck (hex)' },
        deckIsPublic: {
          type: 'boolean',
          description: 'Whether deck is public',
        },
        courseName: {
          type: 'string',
          description: 'Name for generated course',
        },
        lessonCount: {
          type: 'number',
          description: 'Number of lessons to generate',
        },
        quizQuestionType: {
          type: 'string',
          enum: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MIXED'],
        },
        quizDifficulty: {
          type: 'string',
          enum: ['EASY', 'MEDIUM', 'HARD', 'MIXED'],
        },
        quizQuestionCount: { type: 'number' },
        quizTimeLimit: { type: 'number' },
        quizPassingScore: { type: 'number' },
        maxVocabulary: { type: 'number' },
        minWordLength: { type: 'number' },
        createDeckForQuiz: { type: 'boolean' },
      },
      required: ['file', 'contentTypes'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
          return cb(
            new BadRequestException(
              `Unsupported file type: ${file.mimetype}. Allowed types: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @HttpCode(200)
  async convertDocument(
    @Req() req: RequestWithUser,
    @UploadedFile() file?: Express.Multer.File,
    @Body() dto?: DocumentConversionRequestDto,
  ): Promise<DocumentConversionResponseDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!dto) {
      throw new BadRequestException('Request body is required');
    }

    let fileType = this.documentTextExtractionService.getFileTypeFromExtension(
      file.originalname,
    );
    if (!fileType) {
      fileType = this.documentTextExtractionService.getFileTypeFromMimeType(
        file.mimetype,
      );
      if (!fileType) {
        throw new BadRequestException('Unsupported file type');
      }
    }

    const userId = this.getUserId(req);
    return this.documentConversionService.convertDocument(
      userId,
      file.buffer,
      fileType,
      file.originalname,
      dto,
    );
  }
}
