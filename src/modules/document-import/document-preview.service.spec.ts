import { DocumentPreviewService } from './document-preview.service';
import { DocumentPreviewMapper } from './document-preview.mapper';
import {
  DocumentStructureType,
  ParsedDocumentData,
} from './dto/document-conversion.dto';

describe('DocumentPreviewService', () => {
  const parsedData: ParsedDocumentData = {
    structureType: DocumentStructureType.FREETEXT,
    rawText: '你好 means hello',
    vocabulary: [{ word: '你好', definition: 'hello', difficulty: 1 }],
    qaPairs: [],
    lessons: [],
    metadata: {
      wordCount: 3,
      language: 'zh',
      detectedTopic: 'HSK1',
      confidence: 0.8,
    },
  };

  const textExtractionService = {
    extractText: jest.fn().mockResolvedValue('你好 means hello'),
    getFileTypeFromExtension: jest.fn().mockReturnValue('txt'),
    getFileTypeFromMimeType: jest.fn().mockReturnValue('txt'),
  };
  const parser = { parse: jest.fn().mockResolvedValue(parsedData) };
  const parserRegistry = { getParser: jest.fn().mockReturnValue(parser) };
  const flashcardService = {
    createDeck: jest
      .fn()
      .mockResolvedValue({ id: 'deck-1', name: 'Imported Deck' }),
    bulkCreateFlashcards: jest
      .fn()
      .mockResolvedValue({ created: [{ id: 'card-db-1' }] }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('previews document without creating decks or flashcards', async () => {
    const service = new DocumentPreviewService(
      textExtractionService as any,
      parserRegistry as any,
      new DocumentPreviewMapper(),
      flashcardService as any,
    );

    const result = await service.previewDocument(
      Buffer.from('你好 means hello'),
      'txt',
      'hsk1.txt',
      { language: 'zh', maxVocabulary: 20 },
    );

    expect(result.fileName).toBe('hsk1.txt');
    expect(result.suggestedFlashcards).toHaveLength(1);
    expect(flashcardService.createDeck).not.toHaveBeenCalled();
    expect(flashcardService.bulkCreateFlashcards).not.toHaveBeenCalled();
  });

  it('confirms selected cards by creating one deck and bulk flashcards', async () => {
    const service = new DocumentPreviewService(
      textExtractionService as any,
      parserRegistry as any,
      new DocumentPreviewMapper(),
      flashcardService as any,
    );

    const result = await service.confirmImport(42, {
      fileName: 'hsk1.txt',
      deckName: 'HSK1 Import',
      deckColor: '#8b5cf6',
      topic: 'HSK1',
      flashcards: [
        {
          id: 'card-1',
          front: '你好',
          back: 'hello',
          difficulty: 1,
        },
      ],
    });

    expect(flashcardService.createDeck).toHaveBeenCalledWith(42, {
      name: 'HSK1 Import',
      description: 'Generated from document preview: hsk1.txt',
      color: '#8b5cf6',
      icon: 'book',
      topic: 'HSK1',
      isPublic: false,
    });
    expect(flashcardService.bulkCreateFlashcards).toHaveBeenCalledWith(42, {
      deckId: 'deck-1',
      flashcards: [
        {
          front: '你好',
          back: 'hello',
          pronunciation: undefined,
          example: undefined,
          exampleTranslation: undefined,
          description: undefined,
          notes: undefined,
          difficulty: 1,
          tags: ['HSK1'],
          deckId: 'deck-1',
        },
      ],
    });
    expect(result.imported).toBe(1);
    expect(result.deckId).toBe('deck-1');
  });
});
