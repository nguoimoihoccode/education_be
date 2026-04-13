import { Request } from 'express';

export interface JwtPayload {
  sub: number;
  email: string;
  roles?: string[];
  type: 'access' | 'refresh';
  tokenId?: string;
  iat?: number;
}

export interface RequestWithUser extends Request {
  user?: {
    id: number;
    sub: number;
    email: string;
    roles: string[];
  };
}

export interface RequestWithRefresh extends Request {
  user?: {
    id: number;
    sub: number;
    email: string;
    tokenId: string;
  };
}

export interface DeviceInfo {
  fingerprint?: string;
  ipAddress?: string;
  userAgent?: string;
}
