import { Injectable } from '@nestjs/common';
import { BaseDocumentParser } from './base-document-parser.abstract';
import {
  ParsedDocumentData,
  DocumentStructureType,
} from '../dto/document-conversion.dto';

@Injectable()
export class StructuredParser extends BaseDocumentParser {
  canParse(text: string): boolean {
    const hasChapter = /chapter|section|phần|bài|lesson/i.test(text);
    const hasNumbered = /^\d+\.\s+[A-Z]/m.test(text);
    return hasChapter || hasNumbered;
  }

  async parse(text: string, options: any): Promise<ParsedDocumentData> {
    const language = options.language || 'en';
    const maxVocabulary = options.maxVocabulary || 100;

    const sections = this.splitIntoStructuredSections(text);
    const lessons = sections.map((s, idx) => ({
      title: s.title,
      content: s.content,
      order: idx + 1,
      exercises: [],
    }));

    const vocabulary = this.extractVocabulary(text, language, maxVocabulary);
    const qaPairs = this.extractQAPairs(text);
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
      confidence: 0.8,
    };

    return {
      structureType: DocumentStructureType.STRUCTURED,
      rawText,
      vocabulary,
      qaPairs,
      lessons,
      metadata,
    };
  }

  private splitIntoStructuredSections(
    text: string,
  ): Array<{ title: string; content: string }> {
    const lines = text.split('\n');
    const sections: Array<{ title: string; content: string[] }> = [];
    let current: { title: string; content: string[] } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const headingMatch =
        trimmed.match(
          /^(chapter|section|phần|bài|lesson)\s+(\d+|[a-z]):\s*(.+)$/i,
        ) || trimmed.match(/^(\d+)\.\s+(.+)$/);

      if (headingMatch) {
        if (current) {
          sections.push({ title: current.title, content: current.content });
        }
        const title = headingMatch[3] || headingMatch[2] || trimmed;
        current = { title, content: [] };
      } else if (current) {
        current.content.push(trimmed);
      }
    }

    if (current) {
      sections.push({ title: current.title, content: current.content });
    }

    if (sections.length === 0) {
      return [{ title: 'Document', content: text }];
    }

    return sections.map((s) => ({
      title: s.title,
      content: s.content.join('\n'),
    }));
  }
}
