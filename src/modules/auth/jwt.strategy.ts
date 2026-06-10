import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Request } from 'express';
import { TokenBlacklist } from './entities/token-blacklist.entity';
import { JwtKeyService } from './jwt-key.service';
import { JwtPayload, RequestWithUser } from '../../common/types/auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    jwtKeyService: JwtKeyService,
    @InjectRepository(TokenBlacklist)
    private readonly tokenBlacklistRepository: Repository<TokenBlacklist>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtKeyService.getPublicKey(),
      algorithms: ['RS256'],
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const token = this.extractTokenFromHeader(req);

    if (token) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const blacklisted = await this.tokenBlacklistRepository.findOne({
        where: { token: tokenHash },
      });

      if (blacklisted && blacklisted.expiresAt > new Date()) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    return {
      id: payload.sub,
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles || [],
      tokenId: payload.tokenId,
    };
  }

  private extractTokenFromHeader(req: Request): string | null {
    const authHeader = req.headers?.authorization;
    if (!authHeader) return null;

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : null;
  }
}
