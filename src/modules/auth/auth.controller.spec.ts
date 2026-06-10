import { ConfigService } from '@nestjs/config';
import { MODULE_METADATA } from '@nestjs/common/constants';
import type { Request, Response } from 'express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthModule } from './auth.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  it('registers controller-scoped roles guard in auth module', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) ?? [];

    expect(providers).toContain(RolesGuard);
  });

  it('gets current user sessions with current token id', async () => {
    const authService = {
      getUserSessions: jest.fn().mockResolvedValue([]),
    } as unknown as AuthService;
    const controller = new AuthController(authService, {} as ConfigService);

    await controller.getSessions({ user: { sub: 7, tokenId: 'current-token' } } as never);

    expect(authService.getUserSessions).toHaveBeenCalledWith(7, 'current-token');
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

    await controller.revokeOtherSessions({ user: { sub: 7, tokenId: 'current-token' } } as never);

    expect(authService.revokeOtherUserSessions).toHaveBeenCalledWith(7, 'current-token');
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
});
