import { Injectable } from '@nestjs/common';
import { BaseDocumentParser } from './base-document-parser.abstract';
import {
  ParsedDocumentData,
  DocumentStructureType,
  ParsedLesson,
  ParsedVocabularyItem,
} from '../dto/document-conversion.dto';

@Injectable()
export class MarkdownParser extends BaseDocumentParser {
  canParse(text: string): boolean {
    return /#|^\s*[-*+]\s/m.test(text);
  }

  async parse(text: string, options: any): Promise<ParsedDocumentData> {
    const language = options.language || 'en';
    const maxVocabulary = options.maxVocabulary || 100;

    let vocabulary: ParsedVocabularyItem[] = [];
    const qaPairs = this.extractQAPairs(text);
    const lessons = this.extractLessonsFromMarkdown(text);
    const topic = this.detectTopic(text, language);
    const rawText = text;
    const wordCount = text
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    if (vocabulary.length === 0) {
      vocabulary = this.extractVocabularyFromMarkdown(text, maxVocabulary);
    }

    const metadata = {
      wordCount,
      language,
      detectedTopic: topic,
      confidence: 0.7,
    };

    return {
      structureType: DocumentStructureType.MARKDOWN,
      rawText,
      vocabulary,
      qaPairs,
      lessons,
      metadata,
    };
  }

  private extractLessonsFromMarkdown(text: string): ParsedLesson[] {
    const lines = text.split('\n');
    const sections: ParsedLesson[] = [];
    let currentLesson: { title: string; content: string[] } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^#{1,3}\s+.+$/.test(trimmed)) {
        if (currentLesson) {
          sections.push({
            title: currentLesson.title,
            content: currentLesson.content.join('\n'),
            order: sections.length + 1,
            exercises: [],
          });
        }
        currentLesson = {
          title: trimmed.replace(/^#+\s*/, '').trim(),
          content: [],
        };
      } else if (currentLesson && trimmed) {
        currentLesson.content.push(trimmed);
      }
    }

    if (currentLesson) {
      sections.push({
        title: currentLesson.title,
        content: currentLesson.content.join('\n'),
        order: sections.length + 1,
        exercises: [],
      });
    }

    return sections;
  }

  private extractVocabularyFromMarkdown(
    text: string,
    maxItems: number,
  ): ParsedVocabularyItem[] {
    const items: ParsedVocabularyItem[] = [];
    const lines = text.split('\n');
    const pattern = /^\s*[-*+]\s+\*\*(.+?)\*\*:\s*(.+)$/;

    for (const line of lines) {
      const match = line.match(pattern);
      if (match && items.length < maxItems) {
        items.push({
          word: match[1],
          definition: match[2],
          pronunciation: '',
          example: '',
          exampleTranslation: '',
          description: '',
          partOfSpeech: '',
          difficulty: 1,
          tags: [],
        });
      }
    }

    return items;
  }
}
