import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CorsMiddleware } from './common/middlewares/cors.middleware';
import { SecurityMiddleware } from './common/middlewares/security.middleware';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
    console.log('✅ Server is listening on port', process.env.PORT || 3000);
  });

  await app.listen(process.env.PORT || 3000);
}

void bootstrap();
