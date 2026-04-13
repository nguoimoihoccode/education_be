import { Injectable, Logger } from '@nestjs/common';
import { DocumentParser } from './document-parser.interface';
import {
  ParsedDocumentData,
  ParsedVocabularyItem,
  ParsedQAPair,
  ParsedLesson,
  QuestionType,
} from '../dto/document-conversion.dto';

@Injectable()
export abstract class BaseDocumentParser extends DocumentParser {
  protected readonly logger = new Logger(this.constructor.name);

  protected extractVocabulary(
    text: string,
    language: string = 'en',
    maxItems: number = 100,
  ): ParsedVocabularyItem[] {
    const sentences = text.split(/[.!?;]+/).filter((s) => s.trim().length > 10);
    const commonWords = new Set([
      'the',
      'be',
      'to',
      'of',
      'and',
      'a',
      'in',
      'that',
      'have',
      'i',
      'it',
      'for',
      'not',
      'on',
      'with',
      'he',
      'as',
      'you',
      'do',
      'at',
      'this',
      'but',
      'his',
      'by',
      'from',
      'they',
      'we',
      'say',
      'her',
      'she',
      'or',
      'an',
      'will',
      'my',
      'one',
      'all',
      'would',
      'there',
      'their',
      'what',
      'so',
      'up',
      'out',
      'if',
      'about',
      'who',
      'get',
      'which',
      'go',
      'me',
      'và',
      'các',
      'là',
      'của',
      'có',
      'với',
      'cho',
      'từ',
      'được',
      'trong',
      'đã',
      'một',
      'như',
      'cũng',
      'về',
      'thì',
      'này',
      'khi',
      'phải',
      'đã',
      'は',
      'が',
      'を',
      'に',
      'の',
      'で',
      'た',
      'は',
      'です',
      'ます',
      '的',
      '了',
      '是',
      '在',
      '有',
      '和',
      '人',
      '这',
      '中',
      '大',
    ]);

    const words: string[] = [];
    const seen = new Set<string>();

    for (const sentence of sentences) {
      const tokens = this.tokenize(sentence);
      for (const token of tokens) {
        const lower = token.toLowerCase();
        if (
          lower.length >= 3 &&
          lower.length <= 30 &&
          !commonWords.has(lower) &&
          !seen.has(lower) &&
          !/^\d+$/.test(lower)
        ) {
          seen.add(lower);
          words.push(token);
        }
      }
    }

    return words.slice(0, maxItems).map((word, idx) => ({
      word,
      definition: '',
      pronunciation: '',
      example: '',
      exampleTranslation: '',
      partOfSpeech: '',
      difficulty: 1,
      tags: ['auto-extracted'],
    }));
  }

  protected extractQAPairs(text: string): ParsedQAPair[] {
    const pairs: ParsedQAPair[] = [];
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];

      if (this.isQuestion(line) && this.isAnswer(nextLine)) {
        pairs.push({
          question: line,
          answer: nextLine,
          type: QuestionType.MULTIPLE_CHOICE,
          explanation: '',
          options: [],
          difficulty: 1,
        });
        i++;
      }
    }

    return pairs;
  }

  protected extractLessons(text: string): ParsedLesson[] {
    const sections = this.splitIntoSections(text);
    return sections.map((section, index) => ({
      title: section.title || `Section ${index + 1}`,
      content: section.content,
      order: index + 1,
      exercises: [],
    }));
  }

  protected detectTopic(text: string, language: string = 'en'): string {
    const tokens = this.tokenize(text).filter((t) => t.length > 3);
    const frequencies = new Map<string, number>();
    for (const t of tokens)
      frequencies.set(
        t.toLowerCase(),
        (frequencies.get(t.toLowerCase()) || 0) + 1,
      );
    const sorted = Array.from(frequencies.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    const top = sorted.slice(0, 5).map((e) => e[0]);
    return top.join(', ');
  }

  protected extractTags(text: string): string[] {
    const topic = this.detectTopic(text);
    return topic.split(', ').filter(Boolean);
  }

  protected isStopWord(word: string, language: string = 'en'): boolean {
    const stops = new Set([
      'the',
      'be',
      'to',
      'of',
      'and',
      'a',
      'in',
      'that',
      'have',
      'i',
      'it',
      'for',
      'not',
      'on',
      'with',
      'he',
      'as',
      'you',
      'do',
      'at',
    ]);
    return stops.has(word.toLowerCase());
  }

  private tokenize(text: string): string[] {
    return text
      .replace(/[\u4e00-\u9fa5]/g, (match) => ` ${match} `)
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .toLowerCase()
      .split(' ')
      .filter((w) => w.length > 0);
  }

  private isQuestion(line: string): boolean {
    return (
      /^(what|why|how|when|where|who|which|whose|whom|¿|？|\?|hỏi|câu hỏi)/i.test(
        line.trim(),
      ) || line.trim().endsWith('?')
    );
  }

  private isAnswer(line: string): boolean {
    const answerIndicators = [
      'answer:',
      'solution:',
      'đáp án:',
      '正确答案:',
      'résumé:',
    ];
    return (
      answerIndicators.some((ind) => line.toLowerCase().startsWith(ind)) ||
      line.length > 5
    );
  }

  private splitIntoSections(
    text: string,
  ): Array<{ title: string; content: string }> {
    const lines = text.split('\n');
    const sections: Array<{ title: string; content: string }> = [];
    let currentTitle = 'Introduction';
    let currentContent: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (
        /^(chapter|section|phần|chương|lesson|bài|第)\s+\d+/i.test(trimmed) ||
        /^#{1,3}\s+.+$/.test(trimmed)
      ) {
        if (currentContent.length) {
          sections.push({
            title: currentTitle,
            content: currentContent.join('\n'),
          });
        }
        currentTitle = trimmed.replace(/^#+\s*/, '').trim();
        currentContent = [];
      } else {
        currentContent.push(trimmed);
      }
    }

    if (currentContent.length) {
      sections.push({
        title: currentTitle,
        content: currentContent.join('\n'),
      });
    }

    return sections.length > 0
      ? sections
      : [{ title: 'Content', content: text }];
  }
}
