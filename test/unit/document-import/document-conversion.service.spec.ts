import { Test, TestingModule } from '@nestjs/testing';
import { DocumentConversionService } from '../src/document-conversion.service';
import { DocumentTextExtractionService } from '../src/document-text-extraction.service';
import { ParserRegistry } from '../src/parsers/parser-registry.service';
import { ContentGenerator } from '../src/generators/content-generator.abstract';
import { FlashcardGenerator } from '../src/generators/flashcard-generator.service';
import { VocabularyGenerator } from '../src/generators/vocabulary-generator.service';
import { LessonGenerator } from '../src/generators/lesson-generator.service';
import { QuizGenerator } from '../src/generators/quiz-generator.service';
import {
  DocumentConversionRequestDto,
  DocumentConversionResponseDto,
} from '../src/dto/document-conversion.dto';
import { ParsedDocumentData } from '../src/dto/document-conversion.dto';

describe('DocumentConversionService', () => {
  let service: DocumentConversionService;
  let textExtractionService: DocumentTextExtractionService;
  let parserRegistry: ParserRegistry;
  let mockGenerators: ContentGenerator[];

  const mockTextExtractionService = {
    extractText: jest.fn(),
  };

  const mockParser = {
    parse: jest.fn(),
    constructor: { name: 'MockParser' },
  };

  const mockParserRegistry = {
    getParser: jest.fn(),
  };

  const mockGenerator = {
    canGenerate: jest.fn(),
    generate: jest.fn(),
    getContentType: jest.fn(),
  };

  beforeEach(async () => {
    mockGenerators = [mockGenerator];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentConversionService,
        {
          provide: DocumentTextExtractionService,
          useValue: mockTextExtractionService,
        },
        {
          provide: ParserRegistry,
          useValue: mockParserRegistry,
        },
        {
          provide: FlashcardGenerator,
          useValue: mockGenerator,
        },
        {
          provide: VocabularyGenerator,
          useValue: mockGenerator,
        },
        {
          provide: LessonGenerator,
          useValue: mockGenerator,
        },
        {
          provide: QuizGenerator,
          useValue: mockGenerator,
        },
      ],
    }).compile();

    service = module.get<DocumentConversionService>(DocumentConversionService);
    textExtractionService = module.get<DocumentTextExtractionService>(
      DocumentTextExtractionService,
    );
    parserRegistry = module.get<ParserRegistry>(ParserRegistry);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('convertDocument', () => {
    const mockBuffer = Buffer.from('mock file content');
    const mockText = 'Extracted text from document';
    const mockParsedData: ParsedDocumentData = {
      structureType: 0, // DocumentStructureType.FREETEXT
      rawText: mockText,
      vocabulary: [
        {
          word: 'test',
          definition: 'a test',
          pronunciation: '',
          example: '',
          exampleTranslation: '',
          partOfSpeech: '',
          difficulty: 1,
          tags: [],
        },
      ],
      qaPairs: [],
      lessons: [],
      metadata: {
        wordCount: 5,
        language: 'en',
        detectedTopic: 'test',
        confidence: 0.8,
      },
    };

    const mockDto: DocumentConversionRequestDto = {
      structureType: null,
      language: 'en',
      maxVocabulary: 50,
      minWordLength: 3,
      contentTypes: ['VOCABULARY'],
      topic: '',
      courseName: 'My Course',
    };

    const mockResult: DocumentConversionResponseDto = {
      id: '1-123456',
      originalName: 'test.pdf',
      fileType: 'pdf',
      fileSize: 1024,
      structureType: 0,
      detectedTopic: 'test',
      usedTopic: 'test',
      textLength: 100,
      generatedContent: [
        {
          contentType: 'VOCABULARY',
          name: 'Vocabulary - test',
          id: '1',
          itemCount: 1,
        },
      ],
      processingTime: 1500,
      processedAt: new Date().toISOString(),
    };

    it('should extract text and parse document', async () => {
      mockTextExtractionService.extractText.mockResolvedValue(mockText);
      mockParserRegistry.getParser.mockReturnValue(mockParser);
      mockParser.parse.mockResolvedValue(mockParsedData);

      mockGenerator.canGenerate.mockReturnValue(true);
      mockGenerator.generate.mockResolvedValue({
        contentType: 'VOCABULARY',
        name: 'Vocabulary - test',
        id: '1',
        itemCount: 1,
      } as any);

      const result = await service.convertDocument(
        1,
        mockBuffer,
        'pdf',
        'test.pdf',
        mockDto,
      );

      expect(textExtractionService.extractText).toHaveBeenCalledWith(
        mockBuffer,
        expect.anything(),
        'test.pdf',
      );
      expect(parserRegistry.getParser).toHaveBeenCalledWith(mockText, null);
      expect(mockParser.parse).toHaveBeenCalledWith(
        mockText,
        expect.objectContaining({
          language: 'en',
          maxVocabulary: 50,
          minWordLength: 3,
        }),
      );
    });

    it('should generate content from all applicable generators', async () => {
      mockTextExtractionService.extractText.mockResolvedValue(mockText);
      mockParserRegistry.getParser.mockReturnValue(mockParser);
      mockParser.parse.mockResolvedValue(mockParsedData);

      mockGenerator.canGenerate
        .mockReturnValueOnce(true) // FlashcardGenerator
        .mockReturnValueOnce(true) // VocabularyGenerator
        .mockReturnValueOnce(false) // LessonGenerator
        .mockReturnValueOnce(false); // QuizGenerator

      mockGenerator.generate
        .mockResolvedValueOnce({
          contentType: 'FLASHCARDS',
          name: 'Flashcards',
          id: '1',
          itemCount: 5,
        })
        .mockResolvedValueOnce({
          contentType: 'VOCABULARY',
          name: 'Vocabulary',
          id: '2',
          itemCount: 1,
        });

      const result = await service.convertDocument(
        1,
        mockBuffer,
        'pdf',
        'test.pdf',
        mockDto,
      );

      expect(result.generatedContent).toHaveLength(2);
      expect(result.generatedContent[0].contentType).toBe('FLASHCARDS');
      expect(result.generatedContent[1].contentType).toBe('VOCABULARY');
    });

    it('should return proper response DTO', async () => {
      mockTextExtractionService.extractText.mockResolvedValue(mockText);
      mockParserRegistry.getParser.mockReturnValue(mockParser);
      mockParser.parse.mockResolvedValue(mockParsedData);

      mockGenerator.canGenerate.mockReturnValue(true);
      mockGenerator.generate.mockResolvedValue({
        contentType: 'VOCABULARY',
        name: 'Vocabulary - test',
        id: '1',
        itemCount: 1,
      } as any);

      const result = await service.convertDocument(
        1,
        mockBuffer,
        'pdf',
        'test.pdf',
        mockDto,
      );

      expect(result).toMatchObject({
        originalName: 'test.pdf',
        fileType: 'pdf',
        fileSize: 1024,
        structureType: 0,
        detectedTopic: 'test',
        usedTopic: 'test',
        textLength: 100,
        processingTime: expect.any(Number),
        processedAt: expect.any(String),
      });
      expect(typeof result.id).toBe('string');
      expect(result.id).toContain('1-');
    });

    it('should handle parsing errors', async () => {
      mockTextExtractionService.extractText.mockResolvedValue(mockText);
      mockParserRegistry.getParser.mockReturnValue(mockParser);
      mockParser.parse.mockRejectedValue(new Error('Parse failed'));

      await expect(
        service.convertDocument(1, mockBuffer, 'pdf', 'test.pdf', mockDto),
      ).rejects.toThrow('Parse failed');
    });

    it('should use detected topic when no topic provided', async () => {
      mockTextExtractionService.extractText.mockResolvedValue(mockText);
      mockParserRegistry.getParser.mockReturnValue(mockParser);
      const parsedWithTopic = {
        ...mockParsedData,
        metadata: { ...mockParsedData.metadata, detectedTopic: 'science' },
      };
      mockParser.parse.mockResolvedValue(parsedWithTopic);

      mockGenerator.canGenerate.mockReturnValue(true);
      mockGenerator.generate.mockResolvedValue({
        contentType: 'VOCABULARY',
        name: 'Vocabulary',
        id: '1',
        itemCount: 1,
      } as any);

      const result = await service.convertDocument(
        1,
        mockBuffer,
        'pdf',
        'test.pdf',
        mockDto,
      );

      expect(result.usedTopic).toBe('science');
    });
  });
});
