import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../../common/enums/roles.enum';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { TokenBlacklist } from './entities/token-blacklist.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtKeyService } from './jwt-key.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

const user = {
  id: 1,
  email: 'learner@example.com',
  passwordHash: 'hashed-password',
  name: 'Learner',
  avatar: null,
  phone: null,
  roles: [UserRole.USER, UserRole.STUDENT],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
} as unknown as User;

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    create: jest.Mock;
    findByEmail: jest.Mock;
    findById: jest.Mock;
    findEntityByIdForAuth: jest.Mock;
    findByProviderId: jest.Mock;
    touchLastSeen: jest.Mock;
    updateProfile: jest.Mock;
    toAuthUserResponse: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock; decode: jest.Mock };
  let refreshTokenRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let tokenBlacklistRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    usersService = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findEntityByIdForAuth: jest.fn(),
      findByProviderId: jest.fn(),
      touchLastSeen: jest.fn(),
      updateProfile: jest.fn(),
      toAuthUserResponse: jest.fn(() => ({
        id: '1',
        email: 'learner@example.com',
        displayName: 'Learner',
        avatar: null,
        phone: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
    };
    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
      decode: jest.fn(() => ({ exp: 2_000_000_000 })),
    };
    refreshTokenRepository = {
      create: jest.fn((entity) => entity),
      save: jest.fn(async (entity) => entity),
      findOne: jest.fn(),
      remove: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    tokenBlacklistRepository = {
      create: jest.fn((entity) => entity),
      save: jest.fn(async (entity) => entity),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(async (callback) =>
        callback({
          findOne: refreshTokenRepository.findOne,
          update: refreshTokenRepository.update,
          remove: refreshTokenRepository.remove,
          save: refreshTokenRepository.save,
        }),
      ),
    };
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: DataSource, useValue: dataSource },
        {
          provide: JwtKeyService,
          useValue: {
            getPrivateKey: jest.fn(() => 'private-key'),
            getPublicKey: jest.fn(() => 'public-key'),
          },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepository,
        },
        {
          provide: getRepositoryToken(TokenBlacklist),
          useValue: tokenBlacklistRepository,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('registers a user, stores a refresh token, and signs access and refresh JWTs', async () => {
    usersService.create.mockResolvedValue({ id: user.id });
    usersService.findEntityByIdForAuth.mockResolvedValue(user);

    const result = await service.register(
      { email: user.email, password: 'secret123' },
      { fingerprint: 'device-1', ipAddress: '127.0.0.1', userAgent: 'test' },
    );

    expect(usersService.touchLastSeen).toHaveBeenCalledWith(user.id);
    expect(refreshTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'test',
        isRevoked: false,
      }),
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sub: user.id,
        email: user.email,
        roles: [UserRole.USER, UserRole.STUDENT],
        type: 'access',
      }),
      expect.objectContaining({ algorithm: 'RS256', expiresIn: '15m' }),
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sub: user.id, type: 'refresh' }),
      expect.objectContaining({ algorithm: 'RS256', expiresIn: '7d' }),
    );
    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: expect.objectContaining({ email: user.email }),
    });
  });

  it('rejects login when the email is unknown', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.login({ email: user.email, password: 'secret123' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects login when the password is invalid', async () => {
    usersService.findByEmail.mockResolvedValue(user);
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      service.login({ email: user.email, password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rotates refresh tokens and revokes the used token', async () => {
    const storedToken = {
      tokenId: 'old-token-id',
      userId: user.id,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    };
    refreshTokenRepository.findOne.mockResolvedValue(storedToken);
    usersService.findById.mockResolvedValue({
      id: user.id,
      email: user.email,
      roles: user.roles,
    });

    await service.refreshTokens('old-token-id', user.id);

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(refreshTokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 'old-token-id',
        isRevoked: true,
        replacedBy: expect.any(String),
      }),
    );
    expect(refreshTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        isRevoked: false,
      }),
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ roles: user.roles }),
      expect.objectContaining({ algorithm: 'RS256', expiresIn: '15m' }),
    );
  });

  it('revokes all sessions when a revoked refresh token is reused', async () => {
    refreshTokenRepository.findOne.mockResolvedValue({
      tokenId: 'old-token-id',
      userId: user.id,
      isRevoked: true,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.refreshTokens('old-token-id', user.id),
    ).rejects.toThrow(UnauthorizedException);
    expect(refreshTokenRepository.update).toHaveBeenCalledWith(
      RefreshToken,
      { userId: user.id, isRevoked: false },
      { isRevoked: true },
    );
  });

  it('removes expired refresh tokens before rejecting them', async () => {
    const expiredToken = {
      tokenId: 'expired-token-id',
      userId: user.id,
      isRevoked: false,
      expiresAt: new Date(Date.now() - 60_000),
    };
    refreshTokenRepository.findOne.mockResolvedValue(expiredToken);

    await expect(
      service.refreshTokens('expired-token-id', user.id),
    ).rejects.toThrow(UnauthorizedException);
    expect(refreshTokenRepository.remove).toHaveBeenCalledWith(expiredToken);
  });

  it('rejects refresh when device fingerprint does not match', async () => {
    refreshTokenRepository.findOne.mockResolvedValue({
      tokenId: 'token-id',
      userId: user.id,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      deviceFingerprint: 'different-fingerprint-hash',
    });

    await expect(
      service.refreshTokens('token-id', user.id, { fingerprint: 'device-1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects refresh when a bound device fingerprint is omitted', async () => {
    refreshTokenRepository.findOne.mockResolvedValue({
      tokenId: 'token-id',
      userId: user.id,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      deviceFingerprint: 'stored-fingerprint-hash',
    });

    await expect(service.refreshTokens('token-id', user.id)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('logs out by revoking refresh token and blacklisting access token', async () => {
    const storedToken = {
      tokenId: 'token-id',
      userId: user.id,
      isRevoked: false,
    };
    refreshTokenRepository.findOne.mockResolvedValue(storedToken);

    await expect(service.logout('token-id', 'access-token')).resolves.toEqual({
      message: 'Logged out successfully',
    });

    expect(refreshTokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isRevoked: true }),
    );
    expect(tokenBlacklistRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        tokenType: 'access',
        reason: 'User logout',
      }),
    );
  });
});
