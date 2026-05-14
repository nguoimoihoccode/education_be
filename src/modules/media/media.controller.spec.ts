import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

describe('MediaController', () => {
  it('rejects uploads without an authenticated user', async () => {
    const mediaService = {
      ensureDirectory: jest.fn(),
      createFilename: jest.fn(),
      buildUploadResponse: jest.fn(),
    } as unknown as MediaService;
    const configService = {} as ConfigService;
    const controller = new MediaController(mediaService, configService);

    await expect(
      controller.uploadSoulieMedia(
        { user: undefined, body: {}, protocol: 'http', get: jest.fn() } as any,
        { originalname: 'photo.jpg', buffer: Buffer.from('image') } as any,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mediaService.ensureDirectory).not.toHaveBeenCalled();
  });
});
