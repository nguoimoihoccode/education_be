import { ConfigService } from '@nestjs/config';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { unlink } from 'fs/promises';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ProfileStorageService } from '../profile-storage/profile-storage.service';
import { ProfileStorageModule } from '../profile-storage/profile-storage.module';
import { AuthModule } from './auth.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

jest.mock('fs/promises', () => ({
  unlink: jest.fn(),
}));

describe('AuthController', () => {
  it('registers controller-scoped roles guard in auth module', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) ?? [];
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthModule) ?? [];

    expect(providers).toContain(RolesGuard);
    expect(imports).toContain(ProfileStorageModule);
  });

  it('gets current user sessions with current token id', async () => {
    const authService = {
      getUserSessions: jest.fn().mockResolvedValue([]),
    } as unknown as AuthService;
    const controller = new AuthController(authService, {} as ConfigService);

    await controller.getSessions({
      user: { sub: 7, tokenId: 'current-token' },
    } as never);

    expect(authService.getUserSessions).toHaveBeenCalledWith(
      7,
      'current-token',
    );
  });

  it('revokes one current user session', async () => {
    const authService = {
      revokeUserSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const controller = new AuthController(authService, {} as ConfigService);

    await controller.revokeSession('token-id', { user: { sub: 7 } } as never);

    expect(authService.revokeUserSession).toHaveBeenCalledWith(7, 'token-id');
  });

  it('revokes other current user sessions', async () => {
    const authService = {
      revokeOtherUserSessions: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const controller = new AuthController(authService, {} as ConfigService);

    await controller.revokeOtherSessions({
      user: { sub: 7, tokenId: 'current-token' },
    } as never);

    expect(authService.revokeOtherUserSessions).toHaveBeenCalledWith(
      7,
      'current-token',
    );
  });

  it('updates the current user profile', async () => {
    const authService = {
      updateProfile: jest.fn().mockResolvedValue({ id: '7' }),
    } as unknown as AuthService;
    const controller = new AuthController(authService, {} as ConfigService);
    const dto = { displayName: 'New Name', phone: '0900000000' };

    await controller.updateProfile({ user: { sub: 7 } } as never, dto);

    expect(authService.updateProfile).toHaveBeenCalledWith(7, dto);
  });

  it('changes password while preserving the current session', async () => {
    const authService = {
      changePassword: jest.fn().mockResolvedValue({
        message: 'Password changed successfully',
      }),
    } as unknown as AuthService;
    const controller = new AuthController(authService, {} as ConfigService);
    const dto = {
      currentPassword: 'old-secret',
      newPassword: 'new-secret',
    };

    await controller.changePassword(
      { user: { sub: 7, tokenId: 'current-token' } } as never,
      dto,
    );

    expect(authService.changePassword).toHaveBeenCalledWith(
      7,
      'current-token',
      dto,
    );
  });

  it('gets admin sessions with filters', async () => {
    const authService = {
      getAdminSessions: jest.fn().mockResolvedValue([]),
    } as unknown as AuthService;
    const controller = new AuthController(authService, {} as ConfigService);
    const filters = { userId: 7 };

    await controller.getAdminSessions(filters);

    expect(authService.getAdminSessions).toHaveBeenCalledWith(filters);
  });

  it('revokes admin session', async () => {
    const authService = {
      revokeAdminSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const controller = new AuthController(authService, {} as ConfigService);

    await controller.revokeAdminSession('token-id');

    expect(authService.revokeAdminSession).toHaveBeenCalledWith('token-id');
  });

  it('preserves oauth state in Google callback redirect', async () => {
    const authService = {
      loginWithGoogle: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    } as unknown as AuthService;
    const configService = {
      get: jest.fn().mockReturnValue('http://localhost:5173'),
    } as unknown as ConfigService;
    const controller = new AuthController(authService, configService);
    const redirect = jest.fn();
    const req = {
      user: { provider: 'google', providerId: 'google-user', email: 'a@b.com' },
      query: { state: 'oauth-state' },
      headers: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent'),
    } as unknown as Request;
    const res = { redirect } as unknown as Response;

    await controller.googleAuthCallback(req, res);

    const redirectUrl = new URL(redirect.mock.calls[0][0]);
    const hashParams = new URLSearchParams(redirectUrl.hash.slice(1));
    expect(hashParams.get('state')).toBe('oauth-state');
  });

  it('uploads an avatar, updates the profile, then removes the old avatar', async () => {
    const avatarUrl =
      'http://localhost:3000/uploads/education/users/7/avatars/7-new.png';
    const authService = {
      getAvatar: jest.fn().mockResolvedValue('https://old.test/avatar.png'),
      updateAvatar: jest.fn().mockResolvedValue({
        id: '7',
        avatar: avatarUrl,
      }),
    } as unknown as AuthService;
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const profileStorageService = {
      saveAvatar: jest.fn().mockResolvedValue({
        publicUrl: avatarUrl,
        absolutePath: '/tmp/7-new.png',
      }),
      removeManagedAvatar: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProfileStorageService;
    const controller = new AuthController(
      authService,
      configService,
      profileStorageService,
    );
    const file = createAvatarFile();
    const req = {
      user: { sub: 7 },
      protocol: 'http',
      get: jest.fn().mockReturnValue('localhost:3000'),
    };

    await expect(controller.uploadAvatar(req as never, file)).resolves.toEqual({
      id: '7',
      avatar: avatarUrl,
    });
    expect(profileStorageService.saveAvatar).toHaveBeenCalledWith(
      7,
      file,
      'http://localhost:3000',
    );
    expect(authService.updateAvatar).toHaveBeenCalledWith(7, avatarUrl);
    expect(profileStorageService.removeManagedAvatar).toHaveBeenCalledWith(
      'https://old.test/avatar.png',
    );
  });

  it('maps the upload route to POST /auth/avatar and keeps it protected', () => {
    const handler = AuthController.prototype.uploadAvatar;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('avatar');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
  });

  it('rejects a missing avatar file', async () => {
    const controller = new AuthController(
      {} as AuthService,
      {} as ConfigService,
      {} as ProfileStorageService,
    );

    await expect(
      controller.uploadAvatar({ user: { sub: 7 } } as never, undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('removes the newly saved file when the profile update fails', async () => {
    jest.mocked(unlink).mockResolvedValue(undefined);
    const authService = {
      getAvatar: jest.fn().mockResolvedValue(null),
      updateAvatar: jest.fn().mockRejectedValue(new Error('database failed')),
    } as unknown as AuthService;
    const profileStorageService = {
      saveAvatar: jest.fn().mockResolvedValue({
        publicUrl: 'http://localhost/avatar.png',
        absolutePath: '/tmp/new-avatar.png',
      }),
      removeManagedAvatar: jest.fn(),
    } as unknown as ProfileStorageService;
    const controller = new AuthController(
      authService,
      { get: jest.fn().mockReturnValue('http://localhost') } as never,
      profileStorageService,
    );

    await expect(
      controller.uploadAvatar(
        { user: { sub: 7 }, protocol: 'http', get: jest.fn() } as never,
        createAvatarFile(),
      ),
    ).rejects.toThrow('database failed');
    expect(unlink).toHaveBeenCalledWith('/tmp/new-avatar.png');
    expect(profileStorageService.removeManagedAvatar).not.toHaveBeenCalled();
  });
});

function createAvatarFile(): Express.Multer.File {
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return {
    fieldname: 'avatar',
    originalname: 'avatar.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: buffer.length,
    buffer,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
  };
}
