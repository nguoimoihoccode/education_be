import { Injectable } from '@nestjs/common';
import { ContentType } from '../dto/document-conversion.dto';
import { ParsedDocumentData } from '../dto/document-conversion.dto';
import { GeneratedContentDto } from '../dto/document-conversion.dto';

@Injectable()
export abstract class ContentGenerator {
  abstract getContentType(): ContentType;
  abstract canGenerate(data: ParsedDocumentData, options: any): boolean;
  abstract generate(
    userId: number,
    data: ParsedDocumentData,
    options: any,
  ): Promise<GeneratedContentDto>;
}
