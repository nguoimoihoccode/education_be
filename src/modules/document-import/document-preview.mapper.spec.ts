import { DocumentPreviewMapper } from './document-preview.mapper';
import {
  DocumentStructureType,
  ParsedDocumentData,
} from './dto/document-conversion.dto';

describe('DocumentPreviewMapper', () => {
  it('maps parsed vocabulary into frontend preview cards', () => {
    const mapper = new DocumentPreviewMapper();
    const parsed: ParsedDocumentData = {
      structureType: DocumentStructureType.FREETEXT,
      rawText: '你好 means hello',
      vocabulary: [
        {
          word: '你好',
          definition: 'hello',
          pronunciation: 'ni hao',
          example: '你好，老师。',
          exampleTranslation: 'Hello, teacher.',
          difficulty: 2,
          partOfSpeech: 'phrase',
        },
      ],
      qaPairs: [],
      lessons: [],
      metadata: {
        wordCount: 3,
        language: 'zh',
        detectedTopic: 'HSK1',
        confidence: 0.9,
      },
    };

    const preview = mapper.toImportPreview({
      fileId: 'preview-1',
      fileName: 'hsk1.txt',
      fileType: 'txt',
      parsedData: parsed,
      textLength: 18,
    });

    expect(preview.fileId).toBe('preview-1');
    expect(preview.fileName).toBe('hsk1.txt');
    expect(preview.totalFlashcards).toBe(1);
    expect(preview.estimatedTime).toBe(1);
    expect(preview.parsedContent.title).toBe('hsk1.txt');
    expect(preview.parsedContent.metadata.language).toBe('zh');
    expect(preview.suggestedFlashcards[0]).toEqual({
      id: 'card-1',
      front: '你好',
      back: 'hello',
      pronunciation: 'ni hao',
      example: '你好，老师。',
      exampleTranslation: 'Hello, teacher.',
      description: 'phrase',
      notes: undefined,
      difficulty: 2,
      sourceSection: 'HSK1',
      confidence: 0.9,
    });
  });

  it('uses safe fallbacks for sparse vocabulary items', () => {
    const mapper = new DocumentPreviewMapper();
    const parsed: ParsedDocumentData = {
      structureType: DocumentStructureType.FREETEXT,
      rawText: 'word only',
      vocabulary: [{ word: 'word' }],
      qaPairs: [],
      lessons: [],
      metadata: { wordCount: 2, confidence: 0.4 },
    };

    const preview = mapper.toImportPreview({
      fileId: 'preview-2',
      fileName: 'notes.txt',
      fileType: 'txt',
      parsedData: parsed,
      textLength: 9,
    });

    expect(preview.suggestedFlashcards[0].back).toBe('');
    expect(preview.suggestedFlashcards[0].difficulty).toBe(1);
    expect(preview.suggestedFlashcards[0].sourceSection).toBe('Imported');
    expect(preview.suggestedFlashcards[0].confidence).toBe(0.4);
  });
});
