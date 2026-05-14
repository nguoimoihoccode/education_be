import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
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
