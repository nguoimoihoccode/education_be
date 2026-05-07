import { LessonGenerator } from './lesson-generator.service';
import { VocabularyGenerator } from './vocabulary-generator.service';
import {
  ContentType,
  DocumentStructureType,
  ParsedDocumentData,
} from '../dto/document-conversion.dto';

const parsedData: ParsedDocumentData = {
  structureType: DocumentStructureType.FREETEXT,
  rawText:
    'Support is a price level where buying interest appears. Resistance is a level where selling pressure appears.',
  vocabulary: [
    {
      word: 'support',
      definition: 'A price level where buying interest appears.',
      pronunciation: '',
      example: 'Support held during the pullback.',
      exampleTranslation: '',
      description: '',
      partOfSpeech: 'noun',
      difficulty: 1,
      tags: [],
    },
  ],
  qaPairs: [],
  lessons: [
    {
      title: 'Basics',
      content:
        'Support is a price level where buying interest appears. Resistance is a level where selling pressure appears.',
      order: 1,
      exercises: [],
    },
  ],
  metadata: {
    wordCount: 16,
    language: 'en',
    detectedTopic: 'Trading',
    confidence: 0.8,
  },
};

describe('document import generator language resolution', () => {
  it('uses the resolved language id when generating lessons', async () => {
    const educationService = {
      resolveLanguageId: jest.fn().mockResolvedValue('lang-en-uuid'),
      createCourse: jest
        .fn()
        .mockResolvedValue({ id: 'course-1', title: 'Import Check Course' }),
      createLesson: jest.fn().mockResolvedValue({ id: 'lesson-1' }),
      createExercise: jest.fn(),
    };

    const generator = new LessonGenerator(educationService as any);

    await generator.generate(1, parsedData, {
      contentTypes: [ContentType.LESSONS],
      language: 'en',
      courseName: 'Import Check Course',
    });

    expect(educationService.resolveLanguageId).toHaveBeenCalledWith('en');
    expect(educationService.createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ languageId: 'lang-en-uuid' }),
    );
  });

  it('uses the resolved language id when generating vocabulary', async () => {
    const educationService = {
      resolveLanguageId: jest.fn().mockResolvedValue('lang-en-uuid'),
      createCourse: jest.fn().mockResolvedValue({ id: 'course-1' }),
      createLesson: jest.fn().mockResolvedValue({ id: 'lesson-1' }),
      createVocabulary: jest.fn().mockResolvedValue({ id: 'vocab-1' }),
    };

    const generator = new VocabularyGenerator(educationService as any);

    await generator.generate(1, parsedData, {
      contentTypes: [ContentType.VOCABULARY],
      language: 'en',
      courseName: 'Import Check Course',
    });

    expect(educationService.resolveLanguageId).toHaveBeenCalledWith('en');
    expect(educationService.createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ languageId: 'lang-en-uuid' }),
    );
  });
});
