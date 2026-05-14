import { Test, TestingModule } from '@nestjs/testing';
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { DocumentImportController } from '../../../src/modules/document-import/document-import.controller';
import { DocumentConversionService } from '../../../src/modules/document-import/document-conversion.service';
import {
  DocumentConversionResponseDto,
  DocumentStructureType,
} from '../../../src/modules/document-import/dto/document-conversion.dto';
import { DocumentImportService } from '../../../src/modules/document-import/document-import.service';
import { DocumentPreviewService } from '../../../src/modules/document-import/document-preview.service';
import { DocumentTextExtractionService } from '../../../src/modules/document-import/document-text-extraction.service';
import { RequestWithUser } from '../../../src/common/types/auth.types';
import { FileType } from '../../../src/modules/document-import/dto/upload-document.dto';

// Mock guard that bypasses JWT and sets a test user
class MockJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req: RequestWithUser = context.switchToHttp().getRequest();
    req.user = { sub: 1 } as any;
    return true;
  }
}

describe('DocumentImportController (e2e)', () => {
  let app: INestApplication;
  const mockDocumentImportService = {
    importDocument: jest.fn(),
    importDocumentWithPhrases: jest.fn(),
    getSupportedFileTypes: jest.fn().mockReturnValue(Object.values(FileType)),
  };
  const mockConversionService = {
    convertDocument: jest.fn(),
  };
  const mockTextExtractionService = {
    getFileTypeFromExtension: jest.fn((filename: string) =>
      filename.endsWith('.txt') ? FileType.TXT : null,
    ),
    getFileTypeFromMimeType: jest.fn((mimeType: string) =>
      mimeType === 'text/plain' ? FileType.TXT : null,
    ),
  };
  const mockDocumentPreviewService = {
    previewDocument: jest.fn(),
    confirmImport: jest.fn(),
  };
  const mockResponse: DocumentConversionResponseDto = {
    id: '1-123456',
    originalName: 'test.txt',
    fileType: FileType.TXT,
    fileSize: 123,
    structureType: DocumentStructureType.MARKDOWN,
    detectedTopic: 'test',
    usedTopic: 'test',
    textLength: 10,
    generatedContent: [],
    processingTime: 100,
    processedAt: new Date().toISOString(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentImportController],
      providers: [
        {
          provide: DocumentImportService,
          useValue: mockDocumentImportService,
        },
        {
          provide: DocumentConversionService,
          useValue: mockConversionService,
        },
        {
          provide: DocumentTextExtractionService,
          useValue: mockTextExtractionService,
        },
        {
          provide: DocumentPreviewService,
          useValue: mockDocumentPreviewService,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalGuards(new MockJwtAuthGuard());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('/document-import/supported-types (GET) - returns supported types', async () => {
    const response = await request(app.getHttpServer())
      .get('/document-import/supported-types')
      .expect(200);

    expect(response.body).toEqual(Object.values(FileType));
  });

  it('/document-import/convert (POST) - success', async () => {
    mockConversionService.convertDocument.mockResolvedValue(mockResponse);

    const response = await request(app.getHttpServer())
      .post('/document-import/convert')
      .field('contentTypes', 'VOCABULARY')
      .field('language', 'en')
      .attach('file', Buffer.from('Test document'), 'test.txt')
      .set('Accept', 'application/json')
      .expect(200);

    expect(response.body).toEqual(mockResponse);
    expect(mockConversionService.convertDocument).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Buffer),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        contentTypes: ['VOCABULARY'],
        language: 'en',
      }),
    );
  });

  it('/document-import/convert (POST) - missing file', async () => {
    const response = await request(app.getHttpServer())
      .post('/document-import/convert')
      .send({ contentTypes: ['VOCABULARY'] })
      .set('Content-Type', 'application/json')
      .expect(400);

    expect(response.body).toHaveProperty('message');
  });

  it('/document-import/convert (POST) - missing contentTypes', async () => {
    const response = await request(app.getHttpServer())
      .post('/document-import/convert')
      .attach('file', Buffer.from('test content'), 'test.txt')
      .expect(400);

    expect(response.body).toHaveProperty('message');
  });

  it('/document-import/convert (POST) - with multiple contentTypes', async () => {
    mockConversionService.convertDocument.mockResolvedValue(mockResponse);

    const response = await request(app.getHttpServer())
      .post('/document-import/convert')
      .field('contentTypes', 'VOCABULARY')
      .field('contentTypes', 'FLASHCARDS')
      .field('language', 'en')
      .attach('file', Buffer.from('Sample text'), 'sample.txt')
      .expect(200);

    expect(response.body).toEqual(mockResponse);
    expect(mockConversionService.convertDocument).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Buffer),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        contentTypes: ['VOCABULARY', 'FLASHCARDS'],
        language: 'en',
      }),
    );
  });

  it('/document-import/convert (POST) - includes optional parameters', async () => {
    mockConversionService.convertDocument.mockResolvedValue(mockResponse);

    await request(app.getHttpServer())
      .post('/document-import/convert')
      .field('contentTypes', 'LESSONS')
      .field('structureType', 'MARKDOWN')
      .field('topic', 'HSK1')
      .field('language', 'zh')
      .field('courseName', 'Chinese Basics')
      .field('maxVocabulary', 50)
      .attach('file', Buffer.from('Chinese lesson'), 'lesson.txt')
      .expect(200);

    expect(mockConversionService.convertDocument).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Buffer),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        contentTypes: ['LESSONS'],
        structureType: 'MARKDOWN',
        topic: 'HSK1',
        language: 'zh',
        courseName: 'Chinese Basics',
        maxVocabulary: 50,
      }),
    );
  });
});
