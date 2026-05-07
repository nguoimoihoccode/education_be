import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CorsMiddleware } from './common/middlewares/cors.middleware';
import { SecurityMiddleware } from './common/middlewares/security.middleware';
import {
  formatPortInUseMessage,
  resolveServerPort,
} from './common/utils/server-port.util';
import helmet from 'helmet';

type ListenError = NodeJS.ErrnoException & {
  port?: number;
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const port = resolveServerPort(process.env.PORT);
  const trustProxyHops = Number.parseInt(
    process.env.TRUST_PROXY_HOPS || '0',
    10,
  );
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  // Global validation
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Security headers
  app.use(helmet());

  // Additional security headers
  const security = new SecurityMiddleware();
  app.use(security.use.bind(security));

  // Enable CORS
  const cors = new CorsMiddleware();
  app.use(cors.use.bind(cors));

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Soulie & Education API')
    .setDescription(
      'Backend API for Soulie social platform and Education language learning',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Health check
  app.getHttpServer().on('listening', () => {
    console.log('✅ Server is listening on port', port);
  });

  await app.listen(port);
}

void bootstrap().catch((error: ListenError) => {
  if (error.code === 'EADDRINUSE') {
    const port =
      typeof error.port === 'number'
        ? error.port
        : resolveServerPort(process.env.PORT);
    console.error(formatPortInUseMessage(port));
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
