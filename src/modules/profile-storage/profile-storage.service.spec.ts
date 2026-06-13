import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { ProfileStorageService } from './profile-storage.service';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webp = Buffer.from('524946460000000057454250', 'hex');

describe('ProfileStorageService', () => {
  let root: string;
  let service: ProfileStorageService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'education-avatar-'));
    const configService = {
      get: jest.fn((key: string) =>
        key === 'EDUCATION_AVATAR_STORAGE_PATH' ? root : undefined,
      ),
    } as unknown as ConfigService;
    service = new ProfileStorageService(configService);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores avatars outside the Soulie directory', () => {
    expect(service.getAvatarDirectory(7)).toBe(
      join(root, 'users', '7', 'avatars'),
    );
    expect(service.getAvatarDirectory(7)).not.toContain('soulie');
  });

  it.each([
    [jpeg, 'image/jpeg'],
    [png, 'image/png'],
    [webp, 'image/webp'],
  ] as const)('detects image signatures from decoded bytes', (buffer, type) => {
    expect(service.detectImageType(buffer)).toBe(type);
  });

  it('rejects unsupported bytes and MIME/signature mismatches', async () => {
    expect(service.detectImageType(Buffer.from('not-an-image'))).toBeNull();

    await expect(
      service.saveAvatar(
        7,
        createFile(jpeg, 'image/png', 'fake.png'),
        'http://localhost:3000',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects files larger than five megabytes', async () => {
    const oversized = Buffer.concat([jpeg, Buffer.alloc(5 * 1024 * 1024, 0)]);

    await expect(
      service.saveAvatar(
        7,
        createFile(oversized, 'image/jpeg', 'large.jpg'),
        'http://localhost:3000',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('saves a UUID-named avatar using the detected extension', async () => {
    const result = await service.saveAvatar(
      7,
      createFile(png, 'image/png', '../../unsafe.jpg'),
      'http://localhost:3000/',
    );

    expect(basename(result.absolutePath)).toMatch(/^7-[0-9a-f-]{36}\.png$/);
    expect(result.absolutePath).toBe(
      join(service.getAvatarDirectory(7), basename(result.absolutePath)),
    );
    expect(result.publicUrl).toBe(
      `http://localhost:3000/uploads/education/users/7/avatars/${basename(
        result.absolutePath,
      )}`,
    );
    await expect(readFile(result.absolutePath)).resolves.toEqual(png);
  });

  it('removes only managed Education avatar URLs', async () => {
    const managed = await service.saveAvatar(
      7,
      createFile(webp, 'image/webp', 'avatar.webp'),
      'https://cdn.example.com',
    );
    const unrelated = join(root, 'keep.txt');
    await writeFile(unrelated, 'keep');

    await service.removeManagedAvatar('https://other.test/not-managed.jpg');
    await expect(access(managed.absolutePath)).resolves.toBeUndefined();

    await service.removeManagedAvatar(managed.publicUrl);
    await expect(access(managed.absolutePath)).rejects.toThrow();
    await expect(readFile(unrelated, 'utf8')).resolves.toBe('keep');
  });
});

function createFile(
  buffer: Buffer,
  mimetype: string,
  originalname: string,
): Express.Multer.File {
  return {
    buffer,
    mimetype,
    originalname,
    size: buffer.length,
    fieldname: 'avatar',
    encoding: '7bit',
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
  };
}
