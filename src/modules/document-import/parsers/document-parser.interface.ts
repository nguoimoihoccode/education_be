import { ParsedDocumentData } from '../dto/document-conversion.dto';

export abstract class DocumentParser {
  abstract canParse(text: string): boolean;
  abstract parse(text: string, options: any): Promise<ParsedDocumentData>;
}
