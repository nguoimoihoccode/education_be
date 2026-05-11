import { Test } from '@nestjs/testing';
import { FreetextParser } from './freetext-parser.service';
import { JsonParser } from './json-parser.service';
import { MarkdownParser } from './markdown-parser.service';
import { ParserRegistry } from './parser-registry.service';
import { StructuredParser } from './structured-parser.service';

describe('ParserRegistry', () => {
  it('resolves the parser collection through a dedicated provider token', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FreetextParser,
        MarkdownParser,
        JsonParser,
        StructuredParser,
        ParserRegistry,
        {
          provide: 'DOCUMENT_PARSERS',
          useFactory: (
            freetextParser: FreetextParser,
            markdownParser: MarkdownParser,
            jsonParser: JsonParser,
            structuredParser: StructuredParser,
          ) => [structuredParser, jsonParser, markdownParser, freetextParser],
          inject: [
            FreetextParser,
            MarkdownParser,
            JsonParser,
            StructuredParser,
          ],
        },
      ],
    }).compile();

    const registry = moduleRef.get(ParserRegistry);

    expect(registry.getParser('# Heading', 'MARKDOWN')).toBeInstanceOf(
      MarkdownParser,
    );
  });
});
