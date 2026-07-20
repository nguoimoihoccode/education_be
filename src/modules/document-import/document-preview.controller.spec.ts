import { Test } from '@nestjs/testing';
import { DocumentImportController } from './document-import.controller';
import { DocumentPreviewService } from './document-preview.service';
import { DocumentImportService } from './document-import.service';
import { DocumentConversionService } from './document-conversion.service';
import { DocumentTextExtractionService } from './document-text-extraction.service';

describe('DocumentImportController preview endpoints', () => {
  const previewService = {
    previewDocument: jest
      .fn()
      .mockResolvedValue({ fileId: 'preview-1', suggestedFlashcards: [] }),
    confirmImport: jest
      .fn()
      .mockResolvedValue({ imported: 1, deckId: 'deck-1' }),
  };

  let controller: DocumentImportController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentImportController],
      providers: [
        { provide: DocumentImportService, useValue: {} },
        { provide: DocumentConversionService, useValue: {} },
        {
          provide: DocumentTextExtractionService,
          useValue: {
            getFileTypeFromExtension: jest.fn().mockReturnValue('txt'),
            getFileTypeFromMimeType: jest.fn().mockReturnValue('txt'),
          },
        },
        { provide: DocumentPreviewService, useValue: previewService },
      ],
    }).compile();

    controller = moduleRef.get(DocumentImportController);
  });

  it('previews an uploaded document without confirming import', async () => {
    const file = {
      buffer: Buffer.from('你好 means hello'),
      originalname: 'hsk1.txt',
      mimetype: 'text/plain',
    } as Express.Multer.File;

    const result = await controller.previewDocument(file, { language: 'zh' });

    expect(previewService.previewDocument).toHaveBeenCalledWith(
      file.buffer,
      'txt',
      'hsk1.txt',
      { language: 'zh' },
    );
    expect(result).toEqual({ fileId: 'preview-1', suggestedFlashcards: [] });
  });

  it('confirms selected preview cards for the authenticated user', async () => {
    const result = await controller.confirmDocumentImport(
      { user: { sub: 42 } } as any,
      {
        fileName: 'hsk1.txt',
        flashcards: [
          { id: 'card-1', front: '你好', back: 'hello', difficulty: 1 },
        ],
      },
    );

    expect(previewService.confirmImport).toHaveBeenCalledWith(42, {
      fileName: 'hsk1.txt',
      flashcards: [
        { id: 'card-1', front: '你好', back: 'hello', difficulty: 1 },
      ],
    });
    expect(result).toEqual({ imported: 1, deckId: 'deck-1' });
  });
});
