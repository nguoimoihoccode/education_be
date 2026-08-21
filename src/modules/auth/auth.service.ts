import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, LessThan, MoreThan, Not } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { TokenBlacklist } from './entities/token-blacklist.entity';
import { UserRole } from '../../common/enums/roles.enum';
import { JwtKeyService } from './jwt-key.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { AdminSessionFilterDto, LoginSessionDto } from './dto/session.dto';
import { DeviceInfo } from './helpers/device-info.helper';
import { ChangePasswordDto, UpdateAuthProfileDto } from './dto/profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EducationActivityType } from '../activity-log/entities/activity-log.entity';
import { AuthThrottleService } from './auth-throttle.service';

type SessionUser = {
  email?: string | null;
  displayName?: string | null;
  name?: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly jwtKeyService: JwtKeyService,
    private readonly dataSource: DataSource,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(TokenBlacklist)
    private readonly tokenBlacklistRepository: Repository<TokenBlacklist>,
    private readonly activityLogService: ActivityLogService,
    private readonly authThrottleService: AuthThrottleService,
  ) {}

  async register(createUserDto: CreateUserDto, deviceInfo?: DeviceInfo) {
    const user = await this.usersService.create(createUserDto);
    await this.usersService.touchLastSeen(user.id);
    // Get the full user entity for auth response
    const userEntity = await this.usersService.findEntityByIdForAuth(user.id);
    if (!userEntity) {
      throw new UnauthorizedException('Failed to create user account');
    }
    return this.generateAuthResponse(userEntity, deviceInfo, undefined);
  }

  async login(
    loginDto: LoginDto,
    deviceInfo?: DeviceInfo,
  ): Promise<AuthResponseDto> {
    const identifier = (loginDto.identifier || loginDto.email || '').trim();
    const ip = deviceInfo?.ipAddress;

    const lockRemaining = await this.authThrottleService.getLockRemainingMs(
      identifier,
      ip,
    );
    if (lockRemaining > 0) {
      const minutes = Math.ceil(lockRemaining / 60_000);
      throw new HttpException(
        `Too many failed login attempts. Try again in ${minutes} min.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const userEntity = identifier.includes('@')
      ? await this.usersService.findByEmail(identifier)
      : await this.usersService.findByUsername(identifier.toLowerCase());
    if (!userEntity) {
      await this.authThrottleService.recordFailure(identifier, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(
      loginDto.password,
      userEntity.passwordHash,
    );
    if (!passwordValid) {
      await this.authThrottleService.recordFailure(identifier, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.authThrottleService.clearFailures(identifier, ip);
    await this.usersService.touchLastSeen(userEntity.id);

    // Get full user entity for auth response
    const fullUser = await this.usersService.findEntityByIdForAuth(
      userEntity.id,
    );
    if (!fullUser) {
      throw new UnauthorizedException('User not found');
    }

    return this.generateAuthResponse(fullUser, deviceInfo, undefined);
  }

  async loginWithGoogle(
    googleUser: {
      provider: string;
      providerId: string;
      email?: string;
      name?: string;
      avatar?: string;
    },
    deviceInfo?: DeviceInfo,
  ): Promise<AuthResponseDto> {
    if (!googleUser.email) {
      throw new UnauthorizedException(
        'Google account does not have a verified email',
      );
    }

    // Tìm user theo providerId trước (để tránh duplicate khi user đổi email)
    let user = await this.usersService.findByProviderId(googleUser.providerId);

    if (!user) {
      // Nếu không tìm thấy theo providerId, thử tìm theo email
      user = await this.usersService.findByEmail(googleUser.email);
    }

    if (!user) {
      // Tạo account mới với Google provider
      const createUserDto: CreateUserDto = {
        email: googleUser.email,
        // Đặt password random vì user sẽ đăng nhập bằng Google
        password: randomUUID(),
      };

      await this.usersService.create(
        createUserDto,
        googleUser.provider,
        googleUser.providerId,
      );
      // usersService.create trả về DTO, cần fetch lại entity đầy đủ
      user = await this.usersService.findByProviderId(googleUser.providerId);

      if (!user) {
        throw new UnauthorizedException('Failed to create user account');
      }

      // Update name and avatar from Google profile if available
      if (googleUser.name || googleUser.avatar) {
        await this.usersService.updateProfile(user.id, {
          name: googleUser.name,
          avatar: googleUser.avatar,
        });
        // No need to reassign user; the fullUser fetch below will get updated values
      }
    }

    await this.usersService.touchLastSeen(user.id);

    // Get full user entity for auth response
    const fullUser = await this.usersService.findEntityByIdForAuth(user.id);
    if (!fullUser) {
      throw new UnauthorizedException('User not found');
    }

    return this.generateAuthResponse(fullUser, deviceInfo, undefined);
  }

  async refreshTokens(
    tokenId: string,
    userId: number,
    deviceInfo?: DeviceInfo,
  ) {
    const newTokenId = randomUUID();
    const user = await this.usersService.findById(userId);

    await this.dataSource.transaction(async (manager) => {
      const storedToken = await manager.findOne(RefreshToken, {
        where: { tokenId, userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!storedToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if token is revoked
      if (storedToken.isRevoked) {
        // Token reuse detected - possible security breach
        await manager.update(
          RefreshToken,
          { userId, isRevoked: false },
          { isRevoked: true, revokedAt: new Date() },
        );
        throw new UnauthorizedException(
          'Token reuse detected. All sessions have been terminated.',
        );
      }

      if (storedToken.expiresAt < new Date()) {
        await manager.remove(storedToken);
        throw new UnauthorizedException('Refresh token expired');
      }

      // Verify device fingerprint if this token was bound to one.
      if (storedToken.deviceFingerprint) {
        const fingerprint = deviceInfo?.fingerprint;
        if (!fingerprint) {
          throw new UnauthorizedException('Device fingerprint required');
        }

        const fingerprintHash = this.hashToken(fingerprint);
        if (storedToken.deviceFingerprint !== fingerprintHash) {
          throw new UnauthorizedException('Device fingerprint mismatch');
        }
      }

      storedToken.isRevoked = true;
      storedToken.replacedBy = newTokenId;
      storedToken.lastUsedAt = new Date();
      storedToken.revokedAt = new Date();
      await manager.save(storedToken);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      const refreshTokenEntity = manager.create(RefreshToken, {
        tokenId: newTokenId,
        userId: user.id,
        expiresAt,
        deviceFingerprint: deviceInfo?.fingerprint
          ? this.hashToken(deviceInfo.fingerprint)
          : null,
        ipAddress: deviceInfo?.ipAddress,
        userAgent: deviceInfo?.userAgent,
        isRevoked: false,
        lastUsedAt: new Date(),
      });
      await manager.save(refreshTokenEntity);
    });

    await this.usersService.touchLastSeen(user.id);

    return this.signTokenPair(
      user.id,
      user.email,
      newTokenId,
      user.roles || [UserRole.USER],
    );
  }

  async logout(tokenId: string, accessToken?: string) {
    // Revoke refresh token
    const token = await this.refreshTokenRepository.findOne({
      where: { tokenId },
    });
    if (token) {
      token.isRevoked = true;
      token.revokedAt = new Date();
      await this.refreshTokenRepository.save(token);
    }

    // Add access token to blacklist if provided
    if (accessToken && token?.userId) {
      await this.blacklistToken(
        accessToken,
        token.userId,
        'access',
        'User logout',
      );
    }

    return { message: 'Logged out successfully' };
  }

  async getUserSessions(
    userId: number,
    currentTokenId?: string,
  ): Promise<LoginSessionDto[]> {
    const tokens = await this.refreshTokenRepository.find({
      where: { userId, isRevoked: false, expiresAt: MoreThan(new Date()) },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    return tokens.map((token) => this.toLoginSessionDto(token, currentTokenId));
  }

  async revokeUserSession(userId: number, tokenId: string) {
    const token = await this.refreshTokenRepository.findOne({
      where: { userId, tokenId },
    });
    if (!token) {
      throw new UnauthorizedException('Session not found');
    }

    if (!token.isRevoked) {
      token.isRevoked = true;
      token.revokedAt = new Date();
      await this.refreshTokenRepository.save(token);
    }

    return { message: 'Session revoked' };
  }

  async revokeOtherUserSessions(userId: number, currentTokenId?: string) {
    const where = currentTokenId
      ? { userId, isRevoked: false, tokenId: Not(currentTokenId) }
      : { userId, isRevoked: false };
    await this.refreshTokenRepository.update(where, {
      isRevoked: true,
      revokedAt: new Date(),
    });

    return { message: 'Other sessions revoked' };
  }

  async updateProfile(
    userId: number,
    dto: UpdateAuthProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateAuthProfile(userId, dto);

    await this.activityLogService.recordBestEffort({
      userId,
      type: EducationActivityType.SYSTEM,
      action: 'profile_updated',
      detail: 'Updated profile information',
    });

    return this.usersService.toAuthUserResponse(user);
  }

  async changePassword(
    userId: number,
    currentTokenId: string | undefined,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findEntityByIdForAuth(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.provider !== 'email') {
      throw new BadRequestException('Password login is not enabled');
    }

    const passwordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.updatePasswordHash(userId, passwordHash);
    await this.revokeActiveUserSessions(userId, currentTokenId);
    await this.activityLogService.recordBestEffort({
      userId,
      type: EducationActivityType.SYSTEM,
      action: 'password_changed',
      detail: 'Changed account password',
    });

    return { message: 'Password changed successfully' };
  }

  async getAvatar(userId: number): Promise<string | null> {
    const user = await this.usersService.findEntityByIdForAuth(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.avatar || null;
  }

  async updateAvatar(
    userId: number,
    avatarUrl: string,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.findEntityByIdForAuth(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.usersService.updateProfile(userId, { avatar: avatarUrl });
    const refreshed = await this.usersService.findEntityByIdForAuth(userId);
    if (!refreshed) {
      throw new UnauthorizedException('User not found');
    }

    return this.usersService.toAuthUserResponse(refreshed);
  }

  private async revokeActiveUserSessions(
    userId: number,
    exceptTokenId?: string,
  ) {
    const where = exceptTokenId
      ? { userId, isRevoked: false, tokenId: Not(exceptTokenId) }
      : { userId, isRevoked: false };

    await this.refreshTokenRepository.update(where, {
      isRevoked: true,
      revokedAt: new Date(),
    });
  }

  async getAdminSessions(
    filters: AdminSessionFilterDto = {},
    currentTokenId?: string,
  ): Promise<LoginSessionDto[]> {
    const query = this.refreshTokenRepository
      .createQueryBuilder('token')
      .leftJoinAndSelect('token.user', 'user')
      .orderBy('token.createdAt', 'DESC');

    if (filters.userId) {
      query.andWhere('token.userId = :userId', { userId: filters.userId });
    }
    if (filters.email) {
      query.andWhere('LOWER(user.email) LIKE LOWER(:email)', {
        email: `%${filters.email}%`,
      });
    }
    if (filters.active === true) {
      query.andWhere('token.isRevoked = :isRevoked', { isRevoked: false });
      query.andWhere('token.expiresAt > :now', { now: new Date() });
    } else if (filters.active === false) {
      query.andWhere(
        '(token.isRevoked = :isRevoked OR token.expiresAt <= :now)',
        {
          isRevoked: true,
          now: new Date(),
        },
      );
    }

    const tokens = await query.getMany();

    return tokens.map((token) => this.toLoginSessionDto(token, currentTokenId));
  }

  async revokeAdminSession(tokenId: string) {
    const token = await this.refreshTokenRepository.findOne({
      where: { tokenId },
    });
    if (!token) {
      throw new UnauthorizedException('Session not found');
    }

    if (!token.isRevoked) {
      token.isRevoked = true;
      token.revokedAt = new Date();
      await this.refreshTokenRepository.save(token);
    }

    return { message: 'Session revoked' };
  }

  async revokeAllUserTokens(userId: number) {
    // Revoke all refresh tokens
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true, revokedAt: new Date() },
    );

    // Note: Active access tokens will expire naturally (15 minutes)
    // For immediate revocation, users need to re-login
    return { message: 'All sessions terminated' };
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);
    const blacklisted = await this.tokenBlacklistRepository.findOne({
      where: { token: tokenHash },
    });
    return !!blacklisted && blacklisted.expiresAt > new Date();
  }

  private async blacklistToken(
    token: string,
    userId: number,
    tokenType: 'access' | 'refresh',
    reason: string,
  ) {
    const tokenHash = this.hashToken(token);

    // Decode token to get expiration
    const decoded = this.jwtService.decode(token);
    if (!decoded || typeof decoded !== 'object' || !('exp' in decoded)) {
      throw new UnauthorizedException('Invalid access token');
    }

    const exp = (decoded as { exp?: number }).exp;
    if (typeof exp !== 'number') {
      throw new UnauthorizedException('Invalid access token expiration');
    }
    const expiresAt = new Date(exp * 1000);

    const blacklistEntry = this.tokenBlacklistRepository.create({
      token: tokenHash,
      userId,
      tokenType,
      reason,
      expiresAt,
    });

    await this.tokenBlacklistRepository.save(blacklistEntry);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseUserAgent(userAgent?: string | null) {
    const ua = userAgent || '';
    const device = /mobile|iphone|android/i.test(ua) ? 'Mobile' : 'Desktop';
    const browser = /edg\//i.test(ua)
      ? 'Edge'
      : /chrome|crios/i.test(ua)
        ? 'Chrome'
        : /firefox|fxios/i.test(ua)
          ? 'Firefox'
          : /safari/i.test(ua)
            ? 'Safari'
            : 'Unknown';
    const os = /iphone|ipad|ipod/i.test(ua)
      ? 'iOS'
      : /android/i.test(ua)
        ? 'Android'
        : /mac os x|macintosh/i.test(ua)
          ? 'macOS'
          : /windows/i.test(ua)
            ? 'Windows'
            : /linux/i.test(ua)
              ? 'Linux'
              : 'Unknown';

    return { device, browser, os };
  }

  private toLoginSessionDto(
    token: RefreshToken,
    currentTokenId?: string,
  ): LoginSessionDto {
    const user: SessionUser | undefined = token.user;
    const parsed = this.parseUserAgent(token.userAgent);

    return {
      tokenId: token.tokenId,
      userId: token.userId,
      email: user?.email || '',
      displayName: user?.displayName || user?.name || undefined,
      ipAddress: token.ipAddress || undefined,
      userAgent: token.userAgent || undefined,
      device: parsed.device,
      browser: parsed.browser,
      os: parsed.os,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt || undefined,
      expiresAt: token.expiresAt,
      isRevoked: token.isRevoked,
      isCurrentSession: token.tokenId === currentTokenId,
    };
  }

  private async generateTokens(
    userId: number,
    email: string,
    deviceInfo?: DeviceInfo,
    tokenId?: string,
    roles?: UserRole[],
  ) {
    const refreshTokenId = tokenId || randomUUID();
    const userRoles = roles || [UserRole.USER];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    // Generate device fingerprint hash if provided
    const fingerprintHash = deviceInfo?.fingerprint
      ? this.hashToken(deviceInfo.fingerprint)
      : null;

    // Store refresh token in database with device info
    const refreshTokenEntity = this.refreshTokenRepository.create({
      tokenId: refreshTokenId,
      userId,
      expiresAt,
      deviceFingerprint: fingerprintHash,
      ipAddress: deviceInfo?.ipAddress,
      userAgent: deviceInfo?.userAgent,
      isRevoked: false,
      lastUsedAt: new Date(),
    });
    await this.refreshTokenRepository.save(refreshTokenEntity);

    return this.signTokenPair(userId, email, refreshTokenId, userRoles);
  }

  private async signTokenPair(
    userId: number,
    email: string,
    refreshTokenId: string,
    userRoles: UserRole[],
  ) {
    // Generate access token with RS256 (short-lived: 15 minutes)
    const accessPayload = {
      sub: userId,
      email,
      roles: userRoles,
      tokenId: refreshTokenId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
    };
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      algorithm: 'RS256',
      privateKey: this.jwtKeyService.getPrivateKey(),
      expiresIn: '15m', // 15 minutes
    });

    // Generate refresh token with RS256 (long-lived: 7 days)
    const refreshPayload = {
      sub: userId,
      email,
      tokenId: refreshTokenId,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
    };
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      algorithm: 'RS256',
      privateKey: this.jwtKeyService.getPrivateKey(),
      expiresIn: '7d', // 7 days
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  private async generateAuthResponse(
    user: any,
    deviceInfo?: DeviceInfo,
    tokenId?: string,
  ): Promise<AuthResponseDto> {
    const refreshTokenId = tokenId || randomUUID();
    const userRoles = user.roles || [UserRole.USER];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const fingerprintHash = deviceInfo?.fingerprint
      ? this.hashToken(deviceInfo.fingerprint)
      : null;

    const accessPayload = {
      sub: user!.id,
      email: user.email,
      roles: userRoles,
      tokenId: refreshTokenId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
    };
    const refreshPayload = {
      sub: user!.id,
      email: user.email,
      tokenId: refreshTokenId,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
    };

    let accessToken: string;
    let refreshToken: string;

    await this.dataSource.transaction(async (manager) => {
      await manager.query?.('SELECT pg_advisory_xact_lock($1)', [user!.id]);
      accessToken = await this.jwtService.signAsync(accessPayload, {
        algorithm: 'RS256',
        privateKey: this.jwtKeyService.getPrivateKey(),
        expiresIn: '15m',
      });
      refreshToken = await this.jwtService.signAsync(refreshPayload, {
        algorithm: 'RS256',
        privateKey: this.jwtKeyService.getPrivateKey(),
        expiresIn: '7d',
      });
      await manager.update(
        RefreshToken,
        { userId: user!.id, isRevoked: false },
        { isRevoked: true, revokedAt: new Date() },
      );
      const refreshTokenEntity = manager.create(RefreshToken, {
        tokenId: refreshTokenId,
        userId: user!.id,
        expiresAt,
        deviceFingerprint: fingerprintHash,
        ipAddress: deviceInfo?.ipAddress,
        userAgent: deviceInfo?.userAgent,
        isRevoked: false,
        lastUsedAt: new Date(),
      });
      await manager.save(refreshTokenEntity);
    });

    return {
      accessToken: accessToken!,
      refreshToken: refreshToken!,
      user: this.usersService.toAuthUserResponse(user),
    };
  }

  // Cleanup expired tokens and blacklist entries (should be called by a scheduled task)
  async cleanupExpiredTokens() {
    const now = new Date();

    // Clean up expired refresh tokens
    await this.refreshTokenRepository.delete({
      expiresAt: LessThan(now),
    });

    // Clean up expired blacklist entries
    await this.tokenBlacklistRepository.delete({
      expiresAt: LessThan(now),
    });

    return { message: 'Cleanup completed' };
  }

  // Get public key for token verification (useful for microservices)
  getPublicKey(): string {
    return this.jwtKeyService.getPublicKey();
  }
}
