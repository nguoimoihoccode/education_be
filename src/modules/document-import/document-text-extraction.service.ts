import { Injectable, BadRequestException } from '@nestjs/common';
import pdf from 'pdf-parse';
import * as mammoth from 'mammoth';
import * as xlsx from 'xlsx';
import { FileType } from './dto/upload-document.dto';

@Injectable()
export class DocumentTextExtractionService {
  async extractText(
    buffer: Buffer,
    fileType: FileType,
    originalName: string,
  ): Promise<string> {
    try {
      switch (fileType) {
        case FileType.PDF:
          return await this.extractFromPDF(buffer);
        case FileType.DOCX:
          return await this.extractFromDOCX(buffer);
        case FileType.DOC:
          throw new BadRequestException(
            'Legacy .doc files are not supported. Please convert to .docx',
          );
        case FileType.XLSX:
        case FileType.XLS:
          return await this.extractFromExcel(buffer);
        case FileType.JSON:
          return await this.extractFromJSON(buffer);
        case FileType.TXT:
          return buffer.toString('utf-8');
        default:
          throw new BadRequestException(`Unsupported file type: ${fileType}`);
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to extract text from ${originalName}: ${error.message}`,
      );
    }
  }

  private async extractFromPDF(buffer: Buffer): Promise<string> {
    const data = await (pdf as any)(buffer);
    return data.text;
  }

  private async extractFromDOCX(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  private async extractFromExcel(buffer: Buffer): Promise<string> {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    let text = '';

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const sheetText = xlsx.utils.sheet_to_txt(worksheet);
      text += `--- Sheet: ${sheetName} ---\n${sheetText}\n\n`;
    });

    return text.trim();
  }

  private async extractFromJSON(buffer: Buffer): Promise<string> {
    try {
      const jsonContent = JSON.parse(buffer.toString('utf-8'));

      // Handle different JSON structures
      if (Array.isArray(jsonContent)) {
        return jsonContent
          .map((item) => this.extractTextFromJSONItem(item))
          .filter((text) => text.length > 0)
          .join('\n');
      } else if (typeof jsonContent === 'object') {
        return this.extractTextFromJSONItem(jsonContent);
      } else {
        return String(jsonContent);
      }
    } catch (error) {
      throw new BadRequestException('Invalid JSON format');
    }
  }

  private extractTextFromJSONItem(item: any): string {
    if (typeof item === 'string') {
      return item;
    } else if (typeof item === 'number' || typeof item === 'boolean') {
      return String(item);
    } else if (Array.isArray(item)) {
      return item
        .map((subItem) => this.extractTextFromJSONItem(subItem))
        .filter((text) => text.length > 0)
        .join(' ');
    } else if (typeof item === 'object' && item !== null) {
      return Object.values(item)
        .map((value) => this.extractTextFromJSONItem(value))
        .filter((text) => text.length > 0)
        .join(' ');
    }
    return '';
  }

  getSupportedFileTypes(): FileType[] {
    return Object.values(FileType);
  }

  getFileTypeFromMimeType(mimeType: string): FileType | null {
    const mimeToTypeMap: Record<string, FileType> = {
      'application/pdf': FileType.PDF,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        FileType.DOCX,
      'application/msword': FileType.DOC,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        FileType.XLSX,
      'application/vnd.ms-excel': FileType.XLS,
      'application/json': FileType.JSON,
      'text/plain': FileType.TXT,
    };

    return mimeToTypeMap[mimeType] || null;
  }

  getFileTypeFromExtension(filename: string): FileType | null {
    const ext = filename.split('.').pop()?.toLowerCase();
    const extToTypeMap: Record<string, FileType> = {
      pdf: FileType.PDF,
      docx: FileType.DOCX,
      doc: FileType.DOC,
      xlsx: FileType.XLSX,
      xls: FileType.XLS,
      json: FileType.JSON,
      txt: FileType.TXT,
    };

    return extToTypeMap[ext || ''] || null;
  }
}
