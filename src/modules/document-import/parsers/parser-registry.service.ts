import { Injectable } from '@nestjs/common';
import { DocumentParser } from './document-parser.interface';

@Injectable()
export class ParserRegistry {
  constructor(private readonly parsers: DocumentParser[]) {}

  getParser(text: string, preferredType?: string): DocumentParser {
    const candidates = this.parsers.filter((p) => p.canParse(text));

    if (candidates.length === 0) {
      return (
        this.parsers.find((p) => p.constructor.name === 'FreetextParser') ||
        this.parsers[0]
      );
    }

    if (preferredType) {
      const match = candidates.find((p) =>
        p.constructor.name.toLowerCase().includes(preferredType.toLowerCase()),
      );
      if (match) return match;
    }

    return candidates[0];
  }
}
