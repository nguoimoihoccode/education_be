import { Injectable } from '@nestjs/common';
import { ParsedDocumentData } from './dto/document-conversion.dto';

export interface ImportPreviewResponse {
  fileId: string;
  fileName: string;
  fileType: string;
  parsedContent: {
    title: string;
    content: string;
    sections: Array<{
      id: string;
      title: string;
      content: string;
      level: number;
      startIndex: number;
      endIndex: number;
    }>;
    metadata: {
      wordCount?: number;
      language?: string;
      tags?: string[];
    };
  };
  suggestedFlashcards: Array<{
    id: string;
    front: string;
    back: string;
    pronunciation?: string;
    example?: string;
    exampleTranslation?: string;
    description?: string;
    notes?: string;
    difficulty: number;
    sourceSection: string;
    confidence: number;
  }>;
  totalFlashcards: number;
  estimatedTime: number;
}

interface PreviewInput {
  fileId: string;
  fileName: string;
  fileType: string;
  parsedData: ParsedDocumentData;
  textLength: number;
}

@Injectable()
export class DocumentPreviewMapper {
  toImportPreview(input: PreviewInput): ImportPreviewResponse {
    const sourceSection = input.parsedData.metadata.detectedTopic || 'Imported';
    const confidence = input.parsedData.metadata.confidence || 0.6;
    const suggestedFlashcards = input.parsedData.vocabulary.map(
      (item, index) => ({
        id: `card-${index + 1}`,
        front: item.word,
        back: item.definition || '',
        pronunciation: item.pronunciation,
        example: item.example,
        exampleTranslation: item.exampleTranslation,
        description: item.partOfSpeech,
        notes: item.description,
        difficulty: item.difficulty || 1,
        sourceSection,
        confidence,
      }),
    );

    return {
      fileId: input.fileId,
      fileName: input.fileName,
      fileType: input.fileType,
      parsedContent: {
        title: input.fileName,
        content: input.parsedData.rawText,
        sections: [
          {
            id: 'section-1',
            title: sourceSection,
            content: input.parsedData.rawText,
            level: 1,
            startIndex: 0,
            endIndex: input.textLength,
          },
        ],
        metadata: {
          wordCount: input.parsedData.metadata.wordCount,
          language: input.parsedData.metadata.language,
          tags: input.parsedData.metadata.detectedTopic
            ? [input.parsedData.metadata.detectedTopic]
            : [],
        },
      },
      suggestedFlashcards,
      totalFlashcards: suggestedFlashcards.length,
      estimatedTime: Math.max(1, Math.ceil(suggestedFlashcards.length / 10)),
    };
  }
}
