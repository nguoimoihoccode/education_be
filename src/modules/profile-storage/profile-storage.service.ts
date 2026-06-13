import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join, resolve, sep } from 'path';

type SupportedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const PUBLIC_AVATAR_PREFIX = '/uploads/education/';
const MANAGED_AVATAR_PATH =
  /^users\/\d+\/avatars\/\d+-[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

const IMAGE_EXTENSIONS: Record<SupportedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class ProfileStorageService {
  constructor(private readonly configService: ConfigService) {}

  getStorageRoot(): string {
    return (
      this.configService.get<string>('EDUCATION_AVATAR_STORAGE_PATH') ||
      join('uploads', 'education')
    );
  }

  getAvatarDirectory(userId: number): string {
    return join(this.getStorageRoot(), 'users', String(userId), 'avatars');
  }

  detectImageType(buffer: Buffer): SupportedImageType | null {
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return 'image/jpeg';
    }

    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    if (
      buffer.length >= pngSignature.length &&
      buffer.subarray(0, pngSignature.length).equals(pngSignature)
    ) {
      return 'image/png';
    }

    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }

    return null;
  }

  async saveAvatar(
    userId: number,
    file: Express.Multer.File,
    requestBaseUrl: string,
  ): Promise<{ publicUrl: string; absolutePath: string }> {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Invalid user ID');
    }
    if (file.buffer.length > MAX_AVATAR_SIZE) {
      throw new BadRequestException('Avatar must not exceed 5 MB');
    }

    const detectedType = this.detectImageType(file.buffer);
    if (!detectedType || detectedType !== file.mimetype) {
      throw new BadRequestException('Avatar content does not match its type');
    }

    const directory = this.getAvatarDirectory(userId);
    await mkdir(directory, { recursive: true });

    const filename = `${userId}-${randomUUID()}.${IMAGE_EXTENSIONS[detectedType]}`;
    const absolutePath = resolve(directory, filename);
    await writeFile(absolutePath, file.buffer, { flag: 'wx' });

    const baseUrl = requestBaseUrl.replace(/\/$/, '');
    const publicPath = [
      'uploads',
      'education',
      'users',
      String(userId),
      'avatars',
      filename,
    ].join('/');

    return {
      publicUrl: `${baseUrl}/${publicPath}`,
      absolutePath,
    };
  }

  async removeManagedAvatar(avatarUrl?: string | null): Promise<void> {
    if (!avatarUrl) {
      return;
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(
        new URL(avatarUrl, 'http://local').pathname,
      );
    } catch {
      return;
    }

    if (!pathname.startsWith(PUBLIC_AVATAR_PREFIX)) {
      return;
    }

    const relativePath = pathname.slice(PUBLIC_AVATAR_PREFIX.length);
    if (!MANAGED_AVATAR_PATH.test(relativePath)) {
      return;
    }

    const storageRoot = resolve(this.getStorageRoot());
    const candidate = resolve(storageRoot, relativePath);
    if (!candidate.startsWith(`${storageRoot}${sep}`)) {
      return;
    }

    await unlink(candidate).catch(() => undefined);
  }
}
