import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { MediaService } from './media.service';
import { UploadRateLimit } from '../../common/decorators/rate-limit.decorator';

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);
const maxFileSizeBytes = 10 * 1024 * 1024;

@ApiTags('Soulie Media')
@ApiBearerAuth('JWT-auth')
@Controller('soulie/media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly configService: ConfigService,
  ) {}

  @Post('upload')
  @UploadRateLimit()
  @ApiOperation({ summary: 'Upload Soulie image media' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        target: {
          type: 'string',
          enum: ['moments', 'messages', 'avatars'],
          default: 'moments',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
          return cb(
            new BadRequestException('Only image uploads are supported'),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: maxFileSizeBytes,
      },
    }),
  )
  async uploadSoulieMedia(
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const userId = Number(req.user?.sub);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('User not authenticated');
    }
    const target = MediaController.normalizeTarget(req.body?.target);
    const directory = await this.mediaService.ensureDirectory(target, userId);
    const filename = this.mediaService.createFilename(file.originalname);
    await writeFile(join(directory, filename), file.buffer);

    const requestBaseUrl =
      this.configService.get<string>('MEDIA_PUBLIC_BASE_URL') ||
      `${req.protocol}://${req.get('host')}`;
    const relativePath = [
      'uploads',
      'soulie',
      'users',
      String(userId),
      target,
      filename,
    ].join('/');

    return this.mediaService.buildUploadResponse({
      file: {
        ...file,
        filename,
        path: join(directory, filename),
      },
      relativePath,
      requestBaseUrl,
    });
  }

  private static normalizeTarget(
    rawTarget?: string,
  ): 'moments' | 'messages' | 'avatars' {
    if (rawTarget === 'messages' || rawTarget === 'avatars') {
      return rawTarget;
    }
    return 'moments';
  }
}
