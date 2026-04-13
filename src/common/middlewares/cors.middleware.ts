import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class CorsMiddleware implements NestMiddleware {
  private readonly allowedOrigins: string[];

  constructor() {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    this.allowedOrigins = frontendUrl.split(',').map((origin) => origin.trim());
  }

  use(req: Request, res: Response, next: NextFunction) {
    const origin = req.headers.origin;

    // Check if origin is allowed
    if (origin && this.isOriginAllowed(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
      // Allow requests without Origin header (like mobile apps, curl, etc.)
      const defaultOrigin = this.allowedOrigins[0];
      res.header('Access-Control-Allow-Origin', defaultOrigin);
    }

    res.header(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    );
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Device-Fingerprint',
    );
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  }

  private isOriginAllowed(origin: string): boolean {
    return this.allowedOrigins.some((allowedOrigin) => {
      // Exact match
      if (allowedOrigin === origin) return true;

      // Wildcard subdomain support (e.g., https://*.example.com)
      if (allowedOrigin.includes('*')) {
        const pattern = allowedOrigin.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(origin);
      }

      return false;
    });
  }
}
