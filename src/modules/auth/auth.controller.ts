import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Req,
  Res,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
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

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
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

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  @ApiResponse({ status: 302, description: 'Redirects to Google' })
  async googleAuth() {
    // Guard handles redirect
  }

  @Public()
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
