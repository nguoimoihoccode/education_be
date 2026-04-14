import { Inject, Injectable } from '@nestjs/common';
import { DocumentParser } from './document-parser.interface';

export const DOCUMENT_PARSERS = 'DOCUMENT_PARSERS';

@Injectable()
export class ParserRegistry {
  constructor(
    @Inject(DOCUMENT_PARSERS) private readonly parsers: DocumentParser[],
  ) {}

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
