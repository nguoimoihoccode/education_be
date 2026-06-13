import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
  Res,
  Headers,
  UploadedFile,
  UseInterceptors,
  Optional,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiConsumes,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtRefreshGuard } from './jwt-refresh.guard';
import { Public } from '../../common/decorators/public.decorator';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { extractDeviceInfo } from './helpers/device-info.helper';
import type { Request, Response } from 'express';
import type { RequestWithRefresh } from '../../common/types/auth.types';
import { AuthRateLimit } from '../../common/decorators/rate-limit.decorator';
import { UploadRateLimit } from '../../common/decorators/rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/enums/roles.enum';
import { AdminSessionFilterDto } from './dto/session.dto';
import { ChangePasswordDto, UpdateAuthProfileDto } from './dto/profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { unlink } from 'fs/promises';
import { ProfileStorageService } from '../profile-storage/profile-storage.service';

type RequestWithAccessUser = Request & {
  user?: {
    sub: number;
    tokenId?: string;
  };
};

@ApiTags('Auth')
@Controller('auth')
@UseGuards(RolesGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    @Optional()
    private readonly profileStorageService?: ProfileStorageService,
  ) {}

  @Public()
  @AuthRateLimit()
  @Post('register')
  @ApiOperation({ summary: 'Register new user' })
  @ApiHeader({ name: 'x-device-fingerprint', required: false })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() dto: CreateUserDto, @Req() req: Request) {
    const deviceInfo = extractDeviceInfo(req);
    return this.authService.register(dto, deviceInfo);
  }

  @Public()
  @AuthRateLimit()
  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiHeader({ name: 'x-device-fingerprint', required: false })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login successful, returns tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const deviceInfo = extractDeviceInfo(req);
    return this.authService.login(dto, deviceInfo);
  }

  @Public()
  @AuthRateLimit()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiHeader({ name: 'x-device-fingerprint', required: false })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Tokens refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: RequestWithRefresh) {
    void dto;
    const tokenId = req.user?.tokenId;
    const userId = req.user?.sub;
    const deviceInfo = extractDeviceInfo(req);
    return this.authService.refreshTokens(tokenId!, userId!, deviceInfo);
  }

  @Public()
  @AuthRateLimit()
  @UseGuards(JwtRefreshGuard)
  @Post('logout')
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: RequestWithRefresh,
    @Headers('authorization') authHeader?: string,
  ) {
    void dto;
    const tokenId = req.user?.tokenId;
    const accessToken = authHeader?.replace('Bearer ', '');
    return this.authService.logout(tokenId!, accessToken);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List current user sessions' })
  @ApiResponse({ status: 200, description: 'Sessions returned' })
  async getSessions(@Req() req: RequestWithAccessUser) {
    return this.authService.getUserSessions(req.user!.sub, req.user?.tokenId);
  }

  @Delete('sessions/:tokenId')
  @ApiOperation({ summary: 'Revoke current user session' })
  @ApiResponse({ status: 200, description: 'Session revoked' })
  async revokeSession(
    @Param('tokenId') tokenId: string,
    @Req() req: RequestWithAccessUser,
  ) {
    return this.authService.revokeUserSession(req.user!.sub, tokenId);
  }

  @Delete('sessions')
  @ApiOperation({ summary: 'Revoke other current user sessions' })
  @ApiResponse({ status: 200, description: 'Other sessions revoked' })
  async revokeOtherSessions(@Req() req: RequestWithAccessUser) {
    return this.authService.revokeOtherUserSessions(
      req.user!.sub,
      req.user?.tokenId,
    );
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiBody({ type: UpdateAuthProfileDto })
  @ApiResponse({
    status: 200,
    description: 'Profile updated',
    type: UserResponseDto,
  })
  updateProfile(
    @Req() req: RequestWithAccessUser,
    @Body() dto: UpdateAuthProfileDto,
  ) {
    return this.authService.updateProfile(req.user!.sub, dto);
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change current user password' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 201, description: 'Password changed' })
  changePassword(
    @Req() req: RequestWithAccessUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      req.user!.sub,
      req.user?.tokenId,
      dto,
    );
  }

  @Post('avatar')
  @UploadRateLimit()
  @ApiOperation({ summary: 'Upload current user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        avatar: { type: 'string', format: 'binary' },
      },
      required: ['avatar'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Avatar uploaded',
    type: UserResponseDto,
  })
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
        ) {
          return cb(
            new BadRequestException(
              'Only JPEG, PNG, and WebP avatars are allowed',
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async uploadAvatar(
    @Req() req: RequestWithAccessUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }

    const previousAvatar = await this.authService.getAvatar(req.user!.sub);
    const requestBaseUrl =
      this.configService.get<string>('MEDIA_PUBLIC_BASE_URL') ||
      `${req.protocol}://${req.get('host')}`;
    const saved = await this.profileStorageService!.saveAvatar(
      req.user!.sub,
      file,
      requestBaseUrl,
    );

    try {
      const user = await this.authService.updateAvatar(
        req.user!.sub,
        saved.publicUrl,
      );
      await this.profileStorageService!.removeManagedAvatar(previousAvatar);
      return user;
    } catch (error) {
      await unlink(saved.absolutePath).catch(() => undefined);
      throw error;
    }
  }

  @Get('admin/sessions')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin list sessions' })
  @ApiResponse({ status: 200, description: 'Sessions returned' })
  async getAdminSessions(@Query() filters: AdminSessionFilterDto) {
    return this.authService.getAdminSessions(filters);
  }

  @Delete('admin/sessions/:tokenId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin revoke session' })
  @ApiResponse({ status: 200, description: 'Session revoked' })
  async revokeAdminSession(@Param('tokenId') tokenId: string) {
    return this.authService.revokeAdminSession(tokenId);
  }

  @Public()
  @AuthRateLimit()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  @ApiResponse({ status: 302, description: 'Redirects to Google' })
  async googleAuth() {
    // Guard handles redirect
  }

  @Public()
  @AuthRateLimit()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to frontend with tokens',
  })
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const googleUser = req.user as {
        provider: string;
        providerId: string;
        email?: string;
      };
      const deviceInfo = extractDeviceInfo(req);
      const tokens = await this.authService.loginWithGoogle(
        googleUser,
        deviceInfo,
      );

      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:5173';
      const redirectUrl = new URL('/auth/callback', frontendUrl);
      const hashParams = new URLSearchParams({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      if (state) {
        hashParams.set('state', state);
      }
      redirectUrl.hash = hashParams.toString();

      return res.redirect(redirectUrl.toString());
    } catch {
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:5173';
      const redirectUrl = new URL('/login', frontendUrl);
      redirectUrl.searchParams.set('error', 'google_auth_failed');
      return res.redirect(redirectUrl.toString());
    }
  }
}
