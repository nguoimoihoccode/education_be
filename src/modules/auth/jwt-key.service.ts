import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';
import { generateKeyPairSync } from 'crypto';
import { join } from 'path';

interface JwtKeyPair {
  privateKey: string;
  publicKey: string;
}

@Injectable()
export class JwtKeyService {
  private readonly logger = new Logger(JwtKeyService.name);
  private readonly keyPair: JwtKeyPair;

  constructor(private readonly configService: ConfigService) {
    this.keyPair = this.loadKeys();
  }

  getPrivateKey(): string {
    return this.keyPair.privateKey;
  }

  getPublicKey(): string {
    return this.keyPair.publicKey;
  }

  private loadKeys(): JwtKeyPair {
    const envKeys = this.loadKeysFromEnv();
    if (envKeys) {
      return envKeys;
    }

    const fileKeys = this.loadKeysFromFiles();
    if (fileKeys) {
      return fileKeys;
    }

    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'production') {
      throw new Error(
        'JWT keys are missing. Set JWT_PRIVATE_KEY/JWT_PUBLIC_KEY or provide key files.',
      );
    }

    this.logger.warn(
      'JWT keys not found. Using ephemeral RSA key pair for development.',
    );

    return generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
  }

  private loadKeysFromEnv(): JwtKeyPair | null {
    const privateKey = this.configService.get<string>('JWT_PRIVATE_KEY');
    const publicKey = this.configService.get<string>('JWT_PUBLIC_KEY');

    if (!privateKey || !publicKey) {
      return null;
    }

    return {
      privateKey: this.normalizeKey(privateKey),
      publicKey: this.normalizeKey(publicKey),
    };
  }

  private loadKeysFromFiles(): JwtKeyPair | null {
    const privatePath = this.resolveKeyPath(
      this.configService.get<string>(
        'JWT_PRIVATE_KEY_PATH',
        'keys/private.pem',
      ),
    );
    const publicPath = this.resolveKeyPath(
      this.configService.get<string>('JWT_PUBLIC_KEY_PATH', 'keys/public.pem'),
    );

    if (!existsSync(privatePath) || !existsSync(publicPath)) {
      return null;
    }

    return {
      privateKey: readFileSync(privatePath, 'utf8'),
      publicKey: readFileSync(publicPath, 'utf8'),
    };
  }

  private normalizeKey(key: string): string {
    return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
  }

  private resolveKeyPath(pathValue: string): string {
    if (pathValue.startsWith('/')) {
      return pathValue;
    }
    return join(process.cwd(), pathValue);
  }
}
