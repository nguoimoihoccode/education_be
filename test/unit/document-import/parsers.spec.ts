import { Test, TestingModule } from '@nestjs/testing';
import { FreetextParser } from '../src/parsers/freetext-parser.service';
import { MarkdownParser } from '../src/parsers/markdown-parser.service';
import { JsonParser } from '../src/parsers/json-parser.service';
import { StructuredParser } from '../src/parsers/structured-parser.service';
import {
  DocumentStructureType,
  ParsedVocabularyItem,
} from '../src/dto/document-conversion.dto';
import { BaseDocumentParser } from '../src/parsers/base-document-parser.abstract';

describe('Document Parsers', () => {
  let freetextParser: FreetextParser;
  let markdownParser: MarkdownParser;
  let jsonParser: JsonParser;
  let structuredParser: StructuredParser;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FreetextParser, MarkdownParser, JsonParser, StructuredParser],
    }).compile();

    freetextParser = module.get<FreetextParser>(FreetextParser);
    markdownParser = module.get<MarkdownParser>(MarkdownParser);
    jsonParser = module.get<JsonParser>(JsonParser);
    structuredParser = module.get<StructuredParser>(StructuredParser);
  });

  describe('FreetextParser', () => {
    it('should be defined', () => {
      expect(freetextParser).toBeDefined();
    });

    it('should parse plain text', async () => {
      const text =
        'This is a plain text document. It has several sentences. The vocabulary extraction should work.';
      const result = await freetextParser.parse(text, { language: 'en' });

      expect(result.structureType).toBe(DocumentStructureType.FREETEXT);
      expect(result.rawText).toBe(text);
      expect(result.metadata.language).toBe('en');
      expect(result.metadata.confidence).toBeGreaterThan(0);
      expect(result.lessons).toBeDefined();
      expect(Array.isArray(result.lessons)).toBe(true);
    });

    it('should extract vocabulary', async () => {
      const text =
        'The apple is red. I eat an apple every day. Apples are healthy.';
      const result = await freetextParser.parse(text, { maxVocabulary: 10 });

      expect(result.vocabulary.length).toBeGreaterThan(0);
      expect(result.vocabulary[0]).toHaveProperty('word');
      expect(result.vocabulary[0]).toHaveProperty('definition');
      expect(result.vocabulary[0].word).toBe('apple');
    });

    it('should detect topic from word frequency', async () => {
      const text =
        'Programming in JavaScript and TypeScript is fun. JavaScript has great frameworks.';
      const result = await freetextParser.parse(text, {});

      expect(result.metadata.detectedTopic).toContain('javascript');
    });
  });

  describe('MarkdownParser', () => {
    it('should be defined', () => {
      expect(markdownParser).toBeDefined();
    });

    it('should identify markdown content', () => {
      const markdown =
        '# Title\n\nThis is a paragraph.\n\n## Section\n\n- Item 1\n- Item 2';
      expect(markdownParser.canParse(markdown)).toBe(true);
    });

    it('should reject plain text', () => {
      const plainText = 'Just plain text without any formatting.';
      expect(markdownParser.canParse(plainText)).toBe(false);
    });

    it('should parse markdown lessons from headings', async () => {
      const markdown = `# Introduction

This is the introduction content.

## Vocabulary

Here we learn new words.

## Exercises

Practice what you learned.`;

      const result = await markdownParser.parse(markdown, {});

      expect(result.structureType).toBe(DocumentStructureType.MARKDOWN);
      expect(result.lessons.length).toBe(3);
      expect(result.lessons[0].title).toBe('Introduction');
      expect(result.lessons[1].title).toBe('Vocabulary');
      expect(result.lessons[2].title).toBe('Exercises');
    });

    it('should extract vocabulary from list items with bold formatting', async () => {
      const markdown = `# Lesson

**apple**: a fruit
**banana**: another fruit
**car**: vehicle`;

      const result = await markdownParser.parse(markdown, {
        maxVocabulary: 10,
      });

      expect(result.vocabulary.length).toBe(3);
      expect(result.vocabulary[0].word).toBe('apple');
      expect(result.vocabulary[0].definition).toBe('a fruit');
      expect(result.vocabulary[1].word).toBe('banana');
      expect(result.vocabulary[2].word).toBe('car');
    });

    it('should extract simple Q&A pairs', async () => {
      const markdown = `# Quiz

What is the capital of France?
Paris

What is 2 + 2?
4`;

      const result = await markdownParser.parse(markdown, {});

      expect(result.qaPairs.length).toBe(2);
      expect(result.qaPairs[0].question).toBe('What is the capital of France?');
      expect(result.qaPairs[0].answer).toBe('Paris');
      expect(result.qaPairs[1].question).toBe('What is 2 + 2?');
      expect(result.qaPairs[1].answer).toBe('4');
    });
  });

  describe('JsonParser', () => {
    it('should be defined', () => {
      expect(jsonParser).toBeDefined();
    });

    it('should identify JSON content', () => {
      const json = '{"title": "Document", "content": "Some content"}';
      expect(jsonParser.canParse(json)).toBe(true);
    });

    it('should reject non-JSON content', () => {
      const text = 'This is not JSON.';
      expect(jsonParser.canParse(text)).toBe(false);
    });

    it('should parse JSON document with expected structure', async () => {
      const json = JSON.stringify({
        title: 'My Course',
        description: 'A course about learning',
        lessons: [
          {
            title: 'Lesson 1',
            content: 'Content of lesson 1',
            vocabulary: [
              { word: 'hello', meaning: 'greeting' },
              { word: 'world', meaning: 'earth' },
            ],
          },
        ],
      });

      const result = await jsonParser.parse(json, {});

      expect(result.structureType).toBe(DocumentStructureType.JSON);
      expect(result.lessons.length).toBe(1);
      expect(result.lessons[0].title).toBe('Lesson 1');
      expect(result.lessons[0].content).toBe('Content of lesson 1');
      // Vocabulary from JSON should be extracted
      expect(result.vocabulary.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle invalid JSON gracefully', async () => {
      const invalidJson = '{ title: "missing quotes" }';
      const result = await jsonParser.parse(invalidJson, {});

      expect(result.structureType).toBe(DocumentStructureType.FREETEXT);
      expect(result.rawText).toBe(invalidJson);
    });
  });

  describe('StructuredParser', () => {
    it('should be defined', () => {
      expect(structuredParser).toBeDefined();
    });

    it('should identify structured content with chapter/section headings', () => {
      const text =
        'Chapter 1: Introduction\nThis is content.\n\nLesson 1: Basics\nMore content.';
      expect(structuredParser.canParse(text)).toBe(true);
    });

    it('should reject generic text without structure', () => {
      const text = 'Just plain text without chapters or sections.';
      expect(structuredParser.canParse(text)).toBe(false);
    });

    it('should parse lessons from numbered sections', async () => {
      const text = `Chapter 1: Getting Started
This is the first chapter content.

Lesson 1.1: Basics
Basic concepts go here.

Chapter 2: Advanced
Advanced content here.`;

      const result = await structuredParser.parse(text, {});

      expect(result.structureType).toBe(DocumentStructureType.STRUCTURED);
      expect(result.lessons.length).toBeGreaterThan(0);
      const titles = result.lessons.map((l) => l.title);
      expect(titles.some((t) => t.includes('Getting Started'))).toBe(true);
      expect(titles.some((t) => t.includes('Basics'))).toBe(true);
      expect(titles.some((t) => t.includes('Advanced'))).toBe(true);
    });
  });

  describe('Parser Selection', () => {
    it('should select correct parser based on content', () => {
      const markdown = '# Title\nContent';
      const json = '{"key": "value"}';
      const structured = 'Chapter 1: Title\nContent';
      const plain = 'Just plain text';

      // All parsers inherit canParse from their base, so we test individually
      expect(markdownParser.canParse(markdown)).toBe(true);
      expect(jsonParser.canParse(json)).toBe(true);
      expect(structuredParser.canParse(structured)).toBe(true);
      // Plain text should be handled by freetext (which accepts anything)
      expect(freetextParser.canParse(plain)).toBe(true);
    });
  });
});
