import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './jwt.strategy';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshToken } from './entities/refresh-token.entity';
import { TokenBlacklist } from './entities/token-blacklist.entity';
import { GoogleStrategy } from './google.strategy';
import { TokenCleanupTask } from './tasks/token-cleanup.task';
import { JwtKeyService } from './jwt-key.service';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([RefreshToken, TokenBlacklist]),
    JwtModule.register({}), // Empty config - we'll use RS256 keys directly in service
  ],
  providers: [
    AuthService,
    JwtKeyService,
    JwtStrategy,
    JwtRefreshStrategy,
    JwtAuthGuard,
    GoogleStrategy,
    TokenCleanupTask,
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, JwtKeyService],
})
export class AuthModule {}
