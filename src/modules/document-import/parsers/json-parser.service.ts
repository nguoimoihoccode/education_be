import { Injectable } from '@nestjs/common';
import { BaseDocumentParser } from './base-document-parser.abstract';
import {
  ParsedDocumentData,
  DocumentStructureType,
  ParsedLesson,
} from '../dto/document-conversion.dto';

@Injectable()
export class JsonParser extends BaseDocumentParser {
  canParse(text: string): boolean {
    const trimmed = text.trim();
    return (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    );
  }

  async parse(text: string, options: any): Promise<ParsedDocumentData> {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('Invalid JSON');
    }

    const language = options.language || 'en';
    let vocabulary: any[] = [];
    let qaPairs: any[] = [];
    let lessons: any[] = [];

    if (Array.isArray(data)) {
      vocabulary = data.map((item, idx) => ({
        word:
          typeof item === 'string' ? item : item.word || JSON.stringify(item),
        definition:
          typeof item === 'object' && item.definition ? item.definition : '',
        pronunciation:
          typeof item === 'object' && item.pronunciation
            ? item.pronunciation
            : '',
        example: typeof item === 'object' && item.example ? item.example : '',
        exampleTranslation:
          typeof item === 'object' && item.exampleTranslation
            ? item.exampleTranslation
            : '',
        description:
          typeof item === 'object' && item.description ? item.description : '',
        partOfSpeech:
          typeof item === 'object' && item.partOfSpeech
            ? item.partOfSpeech
            : '',
        difficulty: 1,
        tags: [],
        rank: idx + 1,
      }));
    } else if (typeof data === 'object') {
      vocabulary = data.vocabulary || data.words || [];
      qaPairs = data.qaPairs || data.questions || [];
      lessons = data.lessons || data.chapters || [];
    }

    const topic = this.detectTopic(text, language);
    const rawText = text;
    const wordCount = text
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    const metadata = {
      wordCount,
      language,
      detectedTopic: topic,
      confidence: 0.9,
    };

    return {
      structureType: DocumentStructureType.JSON,
      rawText,
      vocabulary,
      qaPairs,
      lessons: lessons.map((l, idx) => ({
        title: l.title || `Lesson ${idx + 1}`,
        content: l.content || l.body || JSON.stringify(l),
        order: idx + 1,
        exercises: l.exercises || [],
      })),
      metadata,
    };
  }
}
