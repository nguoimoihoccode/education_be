import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EducationService } from '../../src/modules/education/education.service';
import { FlashcardGenerator } from '../src/generators/flashcard-generator.service';
import { VocabularyGenerator } from '../src/generators/vocabulary-generator.service';
import { LessonGenerator } from '../src/generators/lesson-generator.service';
import { QuizGenerator } from '../src/generators/quiz-generator.service';
import {
  ContentType,
  ParsedDocumentData,
} from '../src/dto/document-conversion.dto';
import {
  Course,
  Lesson,
  Vocabulary,
  FlashcardDeck,
  Flashcard,
  Quiz,
  Exercise,
} from '../../src/modules/education/entities';
import { Repository, DataSource } from 'typeorm';
import {
  CreateCourseDto,
  CreateLessonDto,
  CreateVocabularyDto,
  CreateFlashcardDeckDto,
  CreateFlashcardDto,
  CreateQuizDto,
  CreateExerciseDto,
} from '../../src/modules/education/dto';

describe('Content Generators', () => {
  let flashcardGenerator: FlashcardGenerator;
  let vocabularyGenerator: VocabularyGenerator;
  let lessonGenerator: LessonGenerator;
  let quizGenerator: QuizGenerator;
  let educationService: EducationService;

  const mockEducationService = {
    createCourse: jest.fn(),
    createLesson: jest.fn(),
    createVocabulary: jest.fn(),
    createFlashcardDeck: jest.fn(),
    createFlashcard: jest.fn(),
    createQuiz: jest.fn(),
    createExercise: jest.fn(),
  };

  const mockCourseRepository = {
    create: jest.fn(),
    save: jest.fn(),
    insert: jest.fn(),
  };

  const mockLessonRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockVocabularyRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockFlashcardDeckRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockFlashcardRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockQuizRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockExerciseRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDataSource = {
    manager: {
      transaction: jest.fn().mockImplementation(async (cb) => await cb({})),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlashcardGenerator,
        VocabularyGenerator,
        LessonGenerator,
        QuizGenerator,
        EducationService,
        {
          provide: getRepositoryToken(Course),
          useValue: mockCourseRepository,
        },
        {
          provide: getRepositoryToken(Lesson),
          useValue: mockLessonRepository,
        },
        {
          provide: getRepositoryToken(Vocabulary),
          useValue: mockVocabularyRepository,
        },
        {
          provide: getRepositoryToken(FlashcardDeck),
          useValue: mockFlashcardDeckRepository,
        },
        {
          provide: getRepositoryToken(Flashcard),
          useValue: mockFlashcardRepository,
        },
        {
          provide: getRepositoryToken(Quiz),
          useValue: mockQuizRepository,
        },
        {
          provide: getRepositoryToken(Exercise),
          useValue: mockExerciseRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    flashcardGenerator = module.get<FlashcardGenerator>(FlashcardGenerator);
    vocabularyGenerator = module.get<VocabularyGenerator>(VocabularyGenerator);
    lessonGenerator = module.get<LessonGenerator>(LessonGenerator);
    quizGenerator = module.get<QuizGenerator>(QuizGenerator);
    educationService = module.get<EducationService>(EducationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('FlashcardGenerator', () => {
    const mockParsedData: ParsedDocumentData = {
      structureType: DocumentStructureType.MARKDOWN,
      rawText: 'Sample document',
      vocabulary: [
        {
          word: 'hello',
          definition: 'greeting',
          pronunciation: '',
          example: '',
          exampleTranslation: '',
          partOfSpeech: '',
          difficulty: 1,
          tags: [],
        },
        {
          word: 'world',
          definition: 'earth',
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
        wordCount: 10,
        language: 'en',
        detectedTopic: 'greetings',
        confidence: 0.8,
      },
    };

    it('should be defined', () => {
      expect(flashcardGenerator).toBeDefined();
    });

    it('should return correct content type', () => {
      expect(flashcardGenerator.getContentType()).toBe(ContentType.FLASHCARDS);
    });

    it('should not generate if no vocabulary', () => {
      const data: ParsedDocumentData = { ...mockParsedData, vocabulary: [] };
      const result = flashcardGenerator.canGenerate(data, {
        contentTypes: [ContentType.FLASHCARDS],
      });
      expect(result).toBe(false);
    });

    it('should generate flashcards deck with vocabulary', async () => {
      const mockDeck = {
        id: '1',
        title: 'Test',
        description: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 1,
      };
      const mockFlashcard1 = {
        id: '1',
        deckId: '1',
        front: '',
        back: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockFlashcard2 = {
        id: '2',
        deckId: '1',
        front: '',
        back: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockEducationService.createFlashcardDeck.mockResolvedValue(
        mockDeck as any,
      );
      mockEducationService.createFlashcard
        .mockResolvedValueOnce(mockFlashcard1 as any)
        .mockResolvedValueOnce(mockFlashcard2 as any);

      const result = await flashcardGenerator.generate(1, mockParsedData, {
        contentTypes: [ContentType.FLASHCARDS],
        maxVocabulary: 2,
      });

      expect(result.contentType).toBe(ContentType.FLASHCARDS);
      expect(result.itemCount).toBe(2);
      expect(result.id).toBe('1');
      expect(result.createdItems).toHaveLength(2);
      expect(educationService.createFlashcardDeck).toHaveBeenCalledWith({
        title: expect.stringContaining('Vocabulary'),
        description: expect.stringContaining('Auto-generated'),
        userId: 1,
      } as CreateFlashcardDeckDto);
    });
  });

  describe('VocabularyGenerator', () => {
    const mockParsedData: ParsedDocumentData = {
      structureType: DocumentStructureType.MARKDOWN,
      rawText: 'Sample document',
      vocabulary: [
        {
          word: 'bonjour',
          definition: 'hello in French',
          pronunciation: 'bon-zhoor',
          example: 'Bonjour tout le monde',
          exampleTranslation: 'Hello everyone',
          partOfSpeech: 'interjection',
          difficulty: 1,
          tags: ['greeting'],
        },
        {
          word: 'merci',
          definition: 'thank you in French',
          pronunciation: 'mer-see',
          example: 'Merci beaucoup',
          exampleTranslation: 'Thank you very much',
          partOfSpeech: 'interjection',
          difficulty: 1,
          tags: ['gratitude'],
        },
      ],
      qaPairs: [],
      lessons: [],
      metadata: {
        wordCount: 10,
        language: 'fr',
        detectedTopic: 'greetings',
        confidence: 0.8,
      },
    };

    it('should be defined', () => {
      expect(vocabularyGenerator).toBeDefined();
    });

    it('should return correct content type', () => {
      expect(vocabularyGenerator.getContentType()).toBe(ContentType.VOCABULARY);
    });

    it('should not generate if no vocabulary', () => {
      const data: ParsedDocumentData = { ...mockParsedData, vocabulary: [] };
      const result = vocabularyGenerator.canGenerate(data, {
        contentTypes: [ContentType.VOCABULARY],
      });
      expect(result).toBe(false);
    });

    it('should create course and lesson with vocabulary', async () => {
      const mockCourse = {
        id: 1,
        title: 'Test Course',
        description: '',
        level: 'BEGINNER' as any,
        languageId: '1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockLesson = {
        id: 1,
        title: '',
        content: '',
        courseId: 1,
        type: 'VOCABULARY' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockVocab1 = {
        id: 1,
        word: 'bonjour',
        meaning: 'hello in French',
        pronunciation: 'bon-zhoor',
        example: 'Bonjour tout le monde',
        exampleTranslation: 'Hello everyone',
        partOfSpeech: 'interjection',
        difficulty: 1,
        tags: ['greeting'],
        lessonId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockVocab2 = {
        id: 2,
        word: 'merci',
        meaning: 'thank you in French',
        pronunciation: 'mer-see',
        example: 'Merci beaucoup',
        exampleTranslation: 'Thank you very much',
        partOfSpeech: 'interjection',
        difficulty: 1,
        tags: ['gratitude'],
        lessonId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockEducationService.createCourse.mockResolvedValue(mockCourse as any);
      mockEducationService.createLesson.mockResolvedValue(mockLesson as any);
      mockEducationService.createVocabulary
        .mockResolvedValueOnce(mockVocab1 as any)
        .mockResolvedValueOnce(mockVocab2 as any);

      const result = await vocabularyGenerator.generate(1, mockParsedData, {
        contentTypes: [ContentType.VOCABULARY],
        maxVocabulary: 2,
        courseName: 'French Basics',
      });

      expect(result.contentType).toBe(ContentType.VOCABULARY);
      expect(result.itemCount).toBe(2);
      expect(result.id).toBe(1);
      expect(result.createdItems).toHaveLength(2);
      expect(educationService.createCourse).toHaveBeenCalledWith({
        title: 'French Basics',
        description: 'Auto-generated course for vocabulary',
        level: 'BEGINNER',
        languageId: '1',
      } as CreateCourseDto);
    });
  });

  describe('LessonGenerator', () => {
    const mockParsedData: ParsedDocumentData = {
      structureType: DocumentStructureType.MARKDOWN,
      rawText: 'Sample document',
      vocabulary: [],
      qaPairs: [],
      lessons: [
        {
          title: 'Introduction',
          content: 'This is the introduction.',
          order: 1,
          exercises: [],
        },
        {
          title: 'Advanced Topics',
          content: 'Advanced content here.',
          order: 2,
          exercises: [
            {
              question: 'What is X?',
              answer: 'X is Y',
              explanation: 'Because...',
              type: 'MULTIPLE_CHOICE',
              options: ['X is Y', 'Y is X'],
              difficulty: 2,
            },
          ],
        },
      ],
      metadata: {
        wordCount: 50,
        language: 'en',
        detectedTopic: 'learning',
        confidence: 0.8,
      },
    };

    it('should be defined', () => {
      expect(lessonGenerator).toBeDefined();
    });

    it('should return correct content type', () => {
      expect(lessonGenerator.getContentType()).toBe(ContentType.LESSONS);
    });

    it('should not generate if no lessons', () => {
      const data: ParsedDocumentData = { ...mockParsedData, lessons: [] };
      const result = lessonGenerator.canGenerate(data, {
        contentTypes: [ContentType.LESSONS],
      });
      expect(result).toBe(false);
    });

    it('should generate lessons within a course', async () => {
      const mockCourse = {
        id: 1,
        title: 'Test Course',
        description: '',
        level: 'BEGINNER' as any,
        languageId: '1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockLesson1 = {
        id: 1,
        title: 'Introduction',
        content: 'This is the introduction.',
        courseId: 1,
        type: 'VOCABULARY' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockLesson2 = {
        id: 2,
        title: 'Advanced Topics',
        content: 'Advanced content here.',
        courseId: 1,
        type: 'VOCABULARY' as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockExercise = {
        id: 1,
        lessonId: 2,
        type: 'MULTIPLE_CHOICE' as any,
        question: 'What is X?',
        answer: 'X is Y',
        explanation: 'Because...',
        options: ['X is Y', 'Y is X'],
        points: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockEducationService.createCourse.mockResolvedValue(mockCourse as any);
      mockEducationService.createLesson
        .mockResolvedValueOnce(mockLesson1 as any)
        .mockResolvedValueOnce(mockLesson2 as any);
      mockEducationService.createExercise.mockResolvedValue(
        mockExercise as any,
      );

      const result = await lessonGenerator.generate(1, mockParsedData, {
        contentTypes: [ContentType.LESSONS],
        courseName: 'Test Course',
      });

      expect(result.contentType).toBe(ContentType.LESSONS);
      expect(result.itemCount).toBe(2);
      expect(result.id).toBe(1);
      expect(result.createdItems).toHaveLength(2);
      expect(educationService.createCourse).toHaveBeenCalledWith({
        title: 'Test Course',
        description: 'Automatically generated from document',
        level: 'BEGINNER',
        languageId: '1',
      } as CreateCourseDto);
      expect(educationService.createExercise).toHaveBeenCalledTimes(1);
    });
  });

  describe('QuizGenerator', () => {
    const mockParsedData: ParsedDocumentData = {
      structureType: DocumentStructureType.MARKDOWN,
      rawText: 'Sample document',
      vocabulary: [],
      qaPairs: [
        {
          question: 'What is the capital of France?',
          answer: 'Paris',
          explanation: '',
          type: 'MULTIPLE_CHOICE',
          options: ['Paris', 'London', 'Berlin'],
          difficulty: 1,
        },
        {
          question: 'What is 2 + 2?',
          answer: '4',
          explanation: 'Basic arithmetic',
          type: 'MULTIPLE_CHOICE',
          options: ['3', '4', '5'],
          difficulty: 1,
        },
      ],
      lessons: [],
      metadata: {
        wordCount: 10,
        language: 'en',
        detectedTopic: 'quiz',
        confidence: 0.6,
      },
    };

    it('should be defined', () => {
      expect(quizGenerator).toBeDefined();
    });

    it('should return correct content type', () => {
      expect(quizGenerator.getContentType()).toBe(ContentType.QUIZZES);
    });

    it('should not generate if no Q&A pairs', () => {
      const data: ParsedDocumentData = { ...mockParsedData, qaPairs: [] };
      const result = quizGenerator.canGenerate(data, {
        contentTypes: [ContentType.QUIZZES],
      });
      expect(result).toBe(false);
    });

    it('should generate quiz from Q&A pairs', async () => {
      const mockQuiz = {
        id: 1,
        title: 'Quiz',
        description: '',
        courseId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockExercise1 = {
        id: 1,
        quizId: 1,
        type: 'MULTIPLE_CHOICE' as any,
        question: 'What is the capital of France?',
        answer: 'Paris',
        explanation: '',
        options: ['Paris', 'London', 'Berlin'],
        points: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockExercise2 = {
        id: 2,
        quizId: 1,
        type: 'MULTIPLE_CHOICE' as any,
        question: 'What is 2 + 2?',
        answer: '4',
        explanation: 'Basic arithmetic',
        options: ['3', '4', '5'],
        points: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockEducationService.createQuiz.mockResolvedValue(mockQuiz as any);
      mockEducationService.createExercise
        .mockResolvedValueOnce(mockExercise1 as any)
        .mockResolvedValueOnce(mockExercise2 as any);

      const result = await quizGenerator.generate(1, mockParsedData, {
        contentTypes: [ContentType.QUIZZES],
        courseName: 'Quiz Course',
      });

      expect(result.contentType).toBe(ContentType.QUIZZES);
      expect(result.itemCount).toBe(2);
      expect(result.id).toBe(1);
      expect(result.createdItems).toHaveLength(2);
      expect(educationService.createQuiz).toHaveBeenCalledWith({
        title: expect.stringContaining('Quiz'),
        description: expect.stringContaining('Auto-generated'),
        courseId: 1,
      } as CreateQuizDto);
    });
  });

  describe('Generator canGenerate conditions', () => {
    it('flashcard generator requires vocabulary and FLASHCARDS in contentTypes', () => {
      const data: ParsedDocumentData = {
        structureType: DocumentStructureType.MARKDOWN,
        rawText: 'test',
        vocabulary: [
          {
            word: 'a',
            definition: 'b',
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
          wordCount: 1,
          language: 'en',
          detectedTopic: '',
          confidence: 1,
        },
      };

      expect(
        flashcardGenerator.canGenerate(data, {
          contentTypes: [ContentType.FLASHCARDS],
        }),
      ).toBe(true);
      expect(
        flashcardGenerator.canGenerate(data, {
          contentTypes: [ContentType.VOCABULARY],
        }),
      ).toBe(false);
      expect(flashcardGenerator.canGenerate(data, { contentTypes: [] })).toBe(
        false,
      );
    });

    it('vocabulary generator requires vocabulary and VOCABULARY in contentTypes', () => {
      const data: ParsedDocumentData = {
        structureType: DocumentStructureType.MARKDOWN,
        rawText: 'test',
        vocabulary: [
          {
            word: 'a',
            definition: 'b',
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
          wordCount: 1,
          language: 'en',
          detectedTopic: '',
          confidence: 1,
        },
      };

      expect(
        vocabularyGenerator.canGenerate(data, {
          contentTypes: [ContentType.VOCABULARY],
        }),
      ).toBe(true);
      expect(
        vocabularyGenerator.canGenerate(data, {
          contentTypes: [ContentType.FLASHCARDS],
        }),
      ).toBe(false);
    });

    it('lesson generator requires lessons and LESSONS or COURSES in contentTypes', () => {
      const data: ParsedDocumentData = {
        structureType: DocumentStructureType.MARKDOWN,
        rawText: 'test',
        vocabulary: [],
        qaPairs: [],
        lessons: [{ title: 'L1', content: 'C1', order: 1, exercises: [] }],
        metadata: {
          wordCount: 1,
          language: 'en',
          detectedTopic: '',
          confidence: 1,
        },
      };

      expect(
        lessonGenerator.canGenerate(data, {
          contentTypes: [ContentType.LESSONS],
        }),
      ).toBe(true);
      expect(
        lessonGenerator.canGenerate(data, {
          contentTypes: [ContentType.COURSES],
        }),
      ).toBe(true);
      expect(
        lessonGenerator.canGenerate(data, {
          contentTypes: [ContentType.VOCABULARY],
        }),
      ).toBe(false);
    });

    it('quiz generator requires qaPairs and QUIZZES in contentTypes', () => {
      const data: ParsedDocumentData = {
        structureType: DocumentStructureType.MARKDOWN,
        rawText: 'test',
        vocabulary: [],
        qaPairs: [
          {
            question: 'Q?',
            answer: 'A',
            type: 'MULTIPLE_CHOICE',
            options: [],
            difficulty: 1,
          },
        ],
        lessons: [],
        metadata: {
          wordCount: 1,
          language: 'en',
          detectedTopic: '',
          confidence: 1,
        },
      };

      expect(
        quizGenerator.canGenerate(data, {
          contentTypes: [ContentType.QUIZZES],
        }),
      ).toBe(true);
      expect(
        quizGenerator.canGenerate(data, {
          contentTypes: [ContentType.LESSONS],
        }),
      ).toBe(false);
    });
  });
});
