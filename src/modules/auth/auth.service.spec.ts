import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EducationActivityType } from '../activity-log/entities/activity-log.entity';
import { UserRole } from '../../common/enums/roles.enum';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { ChangePasswordDto, UpdateAuthProfileDto } from './dto/profile.dto';
import { TokenBlacklist } from './entities/token-blacklist.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtKeyService } from './jwt-key.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
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
    findByUsername: jest.Mock;
    findById: jest.Mock;
    findEntityByIdForAuth: jest.Mock;
    findByProviderId: jest.Mock;
    touchLastSeen: jest.Mock;
    updateProfile: jest.Mock;
    updateAuthProfile: jest.Mock;
    updatePasswordHash: jest.Mock;
    toAuthUserResponse: jest.Mock;
  };
  let activityLogService: { recordBestEffort: jest.Mock };
  let jwtService: { signAsync: jest.Mock; decode: jest.Mock };
  let refreshTokenRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
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
  let queryBuilder: {
    leftJoinAndSelect: jest.Mock;
    orderBy: jest.Mock;
    andWhere: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    usersService = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      findById: jest.fn(),
      findEntityByIdForAuth: jest.fn(),
      findByProviderId: jest.fn(),
      touchLastSeen: jest.fn(),
      updateProfile: jest.fn(),
      updateAuthProfile: jest.fn(),
      updatePasswordHash: jest.fn(),
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
    activityLogService = {
      recordBestEffort: jest.fn().mockResolvedValue(undefined),
    };
    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
      decode: jest.fn(() => ({ exp: 2_000_000_000 })),
    };
    queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };
    refreshTokenRepository = {
      create: jest.fn((entity) => entity),
      save: jest.fn(async (entity) => entity),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => queryBuilder),
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
          create: jest.fn((entityClass, entity) => ({
            entityClass,
            ...entity,
          })),
          save: refreshTokenRepository.save,
          query: jest.fn(),
        }),
      ),
    };
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);
    jest.mocked(bcrypt.hash).mockResolvedValue('new-hash' as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: ActivityLogService, useValue: activityLogService },
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
    expect(refreshTokenRepository.update).toHaveBeenCalledWith(
      RefreshToken,
      { userId: user.id, isRevoked: false },
      { isRevoked: true, revokedAt: expect.any(Date) },
    );
    const transactionCallback = dataSource.transaction.mock.calls[0][0];
    const manager = {
      update: refreshTokenRepository.update,
      create: jest.fn((entityClass, entity) => ({ entityClass, ...entity })),
      save: refreshTokenRepository.save,
      query: jest.fn(),
    };
    await transactionCallback(manager);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock($1)',
      [user.id],
    );
    expect(refreshTokenRepository.save).toHaveBeenCalledWith(
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
        tokenId: expect.any(String),
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

  it('revokes existing active sessions when logging in', async () => {
    usersService.findByEmail.mockResolvedValue(user);
    usersService.findEntityByIdForAuth.mockResolvedValue(user);

    await service.login(
      { email: user.email, password: 'secret123' },
      { fingerprint: 'device-2', ipAddress: '127.0.0.2', userAgent: 'test' },
    );

    expect(refreshTokenRepository.update).toHaveBeenCalledWith(
      RefreshToken,
      { userId: user.id, isRevoked: false },
      { isRevoked: true, revokedAt: expect.any(Date) },
    );
  });

  it('logs in with username and password', async () => {
    usersService.findByUsername.mockResolvedValue(user);
    usersService.findEntityByIdForAuth.mockResolvedValue(user);

    await service.login({
      identifier: 'Learner',
      password: 'secret123',
    } as never);

    expect(usersService.findByUsername).toHaveBeenCalledWith('learner');
    expect(usersService.findByEmail).not.toHaveBeenCalled();
    expect(bcrypt.compare).toHaveBeenCalledWith('secret123', user.passwordHash);
  });

  it('keeps email login payload backward compatible', async () => {
    usersService.findByEmail.mockResolvedValue(user);
    usersService.findEntityByIdForAuth.mockResolvedValue(user);

    await service.login({ email: user.email, password: 'secret123' } as never);

    expect(usersService.findByEmail).toHaveBeenCalledWith(user.email);
  });

  it('preserves email casing when logging in with email identifier', async () => {
    usersService.findByEmail.mockResolvedValue(user);
    usersService.findEntityByIdForAuth.mockResolvedValue(user);

    await service.login({
      identifier: 'Learner@Example.com',
      password: 'secret123',
    } as never);

    expect(usersService.findByEmail).toHaveBeenCalledWith(
      'Learner@Example.com',
    );
  });

  it('does not revoke existing sessions when new login token signing fails', async () => {
    usersService.findByEmail.mockResolvedValue(user);
    usersService.findEntityByIdForAuth.mockResolvedValue(user);
    jwtService.signAsync.mockReset();
    jwtService.signAsync.mockRejectedValueOnce(new Error('sign failed'));

    await expect(
      service.login({ email: user.email, password: 'secret123' }),
    ).rejects.toThrow('sign failed');

    expect(refreshTokenRepository.update).not.toHaveBeenCalledWith(
      RefreshToken,
      { userId: user.id, isRevoked: false },
      { isRevoked: true, revokedAt: expect.any(Date) },
    );
  });

  it('revokes existing active sessions when logging in with Google', async () => {
    usersService.findByProviderId.mockResolvedValue(user);
    usersService.findEntityByIdForAuth.mockResolvedValue(user);

    await service.loginWithGoogle(
      {
        provider: 'google',
        providerId: 'google-user-id',
        email: user.email,
      },
      { fingerprint: 'device-google' },
    );

    expect(refreshTokenRepository.update).toHaveBeenCalledWith(
      RefreshToken,
      { userId: user.id, isRevoked: false },
      { isRevoked: true, revokedAt: expect.any(Date) },
    );
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
    const revokedToken = refreshTokenRepository.save.mock.calls.find(
      ([saved]) => saved.tokenId === 'old-token-id',
    )?.[0];
    const replacementToken = refreshTokenRepository.save.mock.calls.find(
      ([saved]) => saved.tokenId !== 'old-token-id',
    )?.[0];
    expect(revokedToken.replacedBy).toBe(replacementToken.tokenId);
    expect(refreshTokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 'old-token-id',
        isRevoked: true,
        replacedBy: expect.any(String),
        lastUsedAt: expect.any(Date),
        revokedAt: expect.any(Date),
      }),
    );
    expect(replacementToken).toEqual(
      expect.objectContaining({ userId: user.id, isRevoked: false }),
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        roles: user.roles,
        tokenId: expect.any(String),
      }),
      expect.objectContaining({ algorithm: 'RS256', expiresIn: '15m' }),
    );
    expect(refreshTokenRepository.update).not.toHaveBeenCalledWith(
      { userId: user.id, isRevoked: false },
      { isRevoked: true, revokedAt: expect.any(Date) },
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
      { isRevoked: true, revokedAt: expect.any(Date) },
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
      expect.objectContaining({ isRevoked: true, revokedAt: expect.any(Date) }),
    );
    expect(tokenBlacklistRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        tokenType: 'access',
        reason: 'User logout',
      }),
    );
  });

  it('returns active user sessions without device fingerprints', async () => {
    const token = {
      tokenId: 'token-id',
      userId: user.id,
      user: { email: user.email, displayName: 'Display', name: 'Name' },
      ipAddress: '127.0.0.1',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      deviceFingerprint: 'secret',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      lastUsedAt: new Date('2026-01-01T01:00:00.000Z'),
      expiresAt: new Date(Date.now() + 60_000),
      isRevoked: false,
    };
    refreshTokenRepository.find.mockResolvedValue([token]);

    const result = await service.getUserSessions(user.id, 'token-id');

    expect(refreshTokenRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: user.id, isRevoked: false }),
        relations: ['user'],
        order: { createdAt: 'DESC' },
      }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        tokenId: 'token-id',
        email: user.email,
        displayName: 'Display',
        device: 'Desktop',
        browser: 'Chrome',
        os: 'macOS',
        isCurrentSession: true,
      }),
    );
    expect(result[0]).not.toHaveProperty('deviceFingerprint');
  });

  it('revokes owned sessions idempotently and rejects unknown sessions', async () => {
    const token = { tokenId: 'token-id', userId: user.id, isRevoked: false };
    refreshTokenRepository.findOne.mockResolvedValueOnce(token);

    await service.revokeUserSession(user.id, 'token-id');

    expect(refreshTokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isRevoked: true, revokedAt: expect.any(Date) }),
    );

    refreshTokenRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.revokeUserSession(user.id, 'missing')).rejects.toThrow(
      'Session not found',
    );
  });

  it('revokes other user sessions excluding the current token', async () => {
    await service.revokeOtherUserSessions(user.id, 'current-token-id');

    expect(refreshTokenRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        isRevoked: false,
        tokenId: expect.objectContaining({
          _type: 'not',
          _value: 'current-token-id',
        }),
      }),
      expect.objectContaining({ isRevoked: true, revokedAt: expect.any(Date) }),
    );
  });

  it('returns filtered admin sessions and revokes admin sessions', async () => {
    const token = {
      tokenId: 'token-id',
      userId: user.id,
      user: { email: user.email, name: 'Learner' },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: new Date(Date.now() + 60_000),
      isRevoked: false,
    };
    queryBuilder.getMany.mockResolvedValue([token]);
    refreshTokenRepository.findOne.mockResolvedValue(token);

    const sessions = await service.getAdminSessions(
      { userId: user.id, email: 'learner', active: true },
      'other-token-id',
    );
    await service.revokeAdminSession('token-id');

    expect(refreshTokenRepository.createQueryBuilder).toHaveBeenCalledWith(
      'token',
    );
    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'token.user',
      'user',
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'token.createdAt',
      'DESC',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'token.userId = :userId',
      {
        userId: user.id,
      },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'LOWER(user.email) LIKE LOWER(:email)',
      { email: '%learner%' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'token.isRevoked = :isRevoked',
      { isRevoked: false },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'token.expiresAt > :now',
      { now: expect.any(Date) },
    );
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        email: user.email,
        displayName: 'Learner',
        device: 'Mobile',
        browser: 'Safari',
        os: 'iOS',
        isCurrentSession: false,
      }),
    );
    expect(refreshTokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isRevoked: true, revokedAt: expect.any(Date) }),
    );
  });

  it('filters admin inactive sessions as revoked or expired', async () => {
    queryBuilder.getMany.mockResolvedValue([]);

    await service.getAdminSessions({ active: false });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(token.isRevoked = :isRevoked OR token.expiresAt <= :now)',
      { isRevoked: true, now: expect.any(Date) },
    );
  });

  it('sets revokedAt when revoking all user tokens', async () => {
    await service.revokeAllUserTokens(user.id);

    expect(refreshTokenRepository.update).toHaveBeenCalledWith(
      { userId: user.id, isRevoked: false },
      { isRevoked: true, revokedAt: expect.any(Date) },
    );
  });

  it('validates profile and password DTO constraints', async () => {
    const invalidProfile = plainToInstance(UpdateAuthProfileDto, {
      displayName: '   ',
      phone: 'x'.repeat(31),
    });
    const invalidPassword = plainToInstance(ChangePasswordDto, {
      currentPassword: '',
      newPassword: 'short',
    });

    const profileErrors = await validate(invalidProfile);
    const passwordErrors = await validate(invalidPassword);

    expect(profileErrors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['displayName', 'phone']),
    );
    expect(passwordErrors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['currentPassword', 'newPassword']),
    );
  });

  it('updates profile and returns the standard auth user shape', async () => {
    const updated = {
      ...user,
      name: 'New Name',
      phone: '0900000000',
    };
    usersService.updateAuthProfile.mockResolvedValue(updated);
    usersService.toAuthUserResponse.mockReturnValue({
      id: '1',
      email: user.email,
      displayName: 'New Name',
      avatar: null,
      phone: '0900000000',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(
      service.updateProfile(user.id, {
        displayName: ' New Name ',
        phone: ' 0900000000 ',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: '1',
        displayName: 'New Name',
        phone: '0900000000',
      }),
    );
    expect(usersService.updateAuthProfile).toHaveBeenCalledWith(user.id, {
      displayName: ' New Name ',
      phone: ' 0900000000 ',
    });
    expect(activityLogService.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        type: EducationActivityType.SYSTEM,
        action: 'profile_updated',
      }),
    );
  });

  it('rejects password changes for oauth-only users', async () => {
    usersService.findEntityByIdForAuth.mockResolvedValue({
      ...user,
      provider: 'google',
    });

    await expect(
      service.changePassword(user.id, 'token-1', {
        currentPassword: 'old-secret',
        newPassword: 'new-secret',
      }),
    ).rejects.toThrow(new BadRequestException('Password login is not enabled'));
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('rejects password changes when the current password is incorrect', async () => {
    usersService.findEntityByIdForAuth.mockResolvedValue({
      ...user,
      provider: 'email',
    });
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      service.changePassword(user.id, 'token-1', {
        currentPassword: 'wrong-secret',
        newPassword: 'new-secret',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(usersService.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('hashes the new password and revokes every other session', async () => {
    usersService.findEntityByIdForAuth.mockResolvedValue({
      ...user,
      provider: 'email',
    });

    await expect(
      service.changePassword(user.id, 'current-token', {
        currentPassword: 'old-secret',
        newPassword: 'new-secret',
      }),
    ).resolves.toEqual({ message: 'Password changed successfully' });

    expect(bcrypt.compare).toHaveBeenCalledWith(
      'old-secret',
      user.passwordHash,
    );
    expect(bcrypt.hash).toHaveBeenCalledWith('new-secret', 10);
    expect(usersService.updatePasswordHash).toHaveBeenCalledWith(
      user.id,
      'new-hash',
    );
    expect(refreshTokenRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        isRevoked: false,
        tokenId: expect.objectContaining({
          _type: 'not',
          _value: 'current-token',
        }),
      }),
      expect.objectContaining({
        isRevoked: true,
        revokedAt: expect.any(Date),
      }),
    );
    expect(activityLogService.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        type: EducationActivityType.SYSTEM,
        action: 'password_changed',
      }),
    );
  });

  it('gets the current avatar and returns 404 for a missing user', async () => {
    usersService.findEntityByIdForAuth.mockResolvedValueOnce({
      ...user,
      avatar: 'https://example.com/avatar.png',
    });

    await expect(service.getAvatar(user.id)).resolves.toBe(
      'https://example.com/avatar.png',
    );

    usersService.findEntityByIdForAuth.mockResolvedValueOnce(null);
    await expect(service.getAvatar(404)).rejects.toThrow(NotFoundException);
  });

  it('updates avatar and returns the standard auth user response', async () => {
    const avatarUrl =
      'http://localhost:3000/uploads/education/users/1/avatars/1-new.png';
    usersService.updateProfile.mockResolvedValue({ id: user.id });
    usersService.findEntityByIdForAuth.mockResolvedValue({
      ...user,
      avatar: avatarUrl,
    });
    usersService.toAuthUserResponse.mockReturnValue({
      id: '1',
      email: user.email,
      displayName: 'Learner',
      avatar: avatarUrl,
      phone: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(service.updateAvatar(user.id, avatarUrl)).resolves.toEqual(
      expect.objectContaining({ id: '1', avatar: avatarUrl }),
    );
    expect(usersService.updateProfile).toHaveBeenCalledWith(user.id, {
      avatar: avatarUrl,
    });
  });
});
