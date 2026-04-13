import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir } from 'fs/promises';
import { extname, join } from 'path';

type UploadTarget = 'moments' | 'messages' | 'avatars';

@Injectable()
export class MediaService {
  constructor(private readonly configService: ConfigService) {}

  getStorageRoot(): string {
    return this.configService.get<string>('MEDIA_STORAGE_PATH') || 'uploads';
  }

  getTargetDirectory(target: UploadTarget, userId: number): string {
    return join(
      this.getStorageRoot(),
      'soulie',
      'users',
      String(userId),
      target,
    );
  }

  async ensureDirectory(target: UploadTarget, userId: number): Promise<string> {
    const directory = this.getTargetDirectory(target, userId);
    await mkdir(directory, { recursive: true });
    return directory;
  }

  createFilename(originalName: string): string {
    const extension = extname(originalName).toLowerCase() || '.jpg';
    return `${Date.now()}-${randomUUID()}${extension}`;
  }

  buildPublicUrl(relativePath: string, requestBaseUrl: string): string {
    const normalizedRelativePath = relativePath.split('\\').join('/');
    const configuredBaseUrl = this.configService.get<string>(
      'MEDIA_PUBLIC_BASE_URL',
    );
    const baseUrl = (configuredBaseUrl || requestBaseUrl).replace(/\/$/, '');
    return `${baseUrl}/${normalizedRelativePath}`;
  }

  buildUploadResponse(params: {
    file: Express.Multer.File;
    relativePath: string;
    requestBaseUrl: string;
  }) {
    return {
      url: this.buildPublicUrl(params.relativePath, params.requestBaseUrl),
      path: params.relativePath,
      mimeType: params.file.mimetype,
      size: params.file.size,
      originalName: params.file.originalname,
      filename: params.file.filename,
    };
  }
}
