import { Injectable } from '@nestjs/common';
import { BaseDocumentParser } from './base-document-parser.abstract';
import {
  ParsedDocumentData,
  DocumentStructureType,
} from '../dto/document-conversion.dto';

@Injectable()
export class FreetextParser extends BaseDocumentParser {
  canParse(text: string): boolean {
    const hasJson = /^[\{\[]/m.test(text.trim());
    const hasMarkdown = /#|^\s*[-*+]\s/m.test(text);
    return !hasJson && !hasMarkdown;
  }

  async parse(text: string, options: any): Promise<ParsedDocumentData> {
    const language = options.language || 'en';
    const maxVocabulary = options.maxVocabulary || 100;

    const vocabulary = this.extractVocabulary(text, language, maxVocabulary);
    const qaPairs = this.extractQAPairs(text);
    const lessons = this.extractLessons(text);
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
      confidence: 0.6,
    };

    return {
      structureType: DocumentStructureType.FREETEXT,
      rawText,
      vocabulary,
      qaPairs,
      lessons,
      metadata,
    };
  }
}
