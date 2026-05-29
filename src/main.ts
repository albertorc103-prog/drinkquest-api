import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as compression from 'compression';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';
import { ConfigurableIoAdapter } from './common/adapters/configurable-io.adapter';
import { buildCorsOptions } from './common/utils/cors.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  const nodeEnv = config.get<string>('app.nodeEnv', 'development');
  const prefix = config.get<string>('app.prefix', 'api/v1');
  const corsOriginsRaw = config.get<string>('app.corsOrigins', '');
  const port = config.get<number>('app.port', 3000);
  const host = config.get<string>('app.host', '0.0.0.0');
  const publicUrl = config.get<string>('app.url', '');
  const apiBaseUrl = config.get<string>('app.apiBaseUrl', '');

  const trustProxy = config.get<boolean>('app.trustProxy', nodeEnv === 'production');
  if (trustProxy) {
    app.getHttpAdapter().getInstance().set('trust proxy', true);
  }

  // Version lives in API_PREFIX (e.g. api/v1). Do not enable URI versioning — it would duplicate /v1.
  app.setGlobalPrefix(prefix);
  app.use(
    helmet({
      // HSTS lo gestiona Cloudflare en el edge; evita conflicto doble en API.
      hsts: nodeEnv !== 'production',
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());

  // Origen no debe cachear JSON de API (Cloudflare debe hacer bypass en reglas).
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    res.setHeader('x-request-id', requestId);
    (req as Request & { requestId?: string }).requestId = requestId;

    if (req.path.startsWith(`/${prefix}`)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
    }

    const critical =
      req.path.startsWith(`/${prefix}/auth`) ||
      req.path.startsWith(`/${prefix}/qr`) ||
      req.path.startsWith(`/${prefix}/promotions`) ||
      req.path.startsWith(`/${prefix}/admin/promotions`);
    if (critical) {
      logger.log(
        JSON.stringify({
          event: 'request_received',
          requestId,
          endpoint: req.path,
          method: req.method,
        }),
      );
    }
    next();
  });

  app.enableCors(buildCorsOptions(nodeEnv, corsOriginsRaw || '*'));

  app.useWebSocketAdapter(
    new ConfigurableIoAdapter(app, nodeEnv, corsOriginsRaw || '*'),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('DrinkQuest API')
    .setDescription('Enterprise REST + WebSocket API for DrinkQuest')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('users')
    .addTag('friends')
    .addTag('chat')
    .addTag('drinks')
    .addTag('qr')
    .addTag('missions')
    .addTag('feed')
    .addTag('bars')
    .addTag('admin')
    .addTag('notifications')
    .addTag('uploads')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(port, host);
  logger.log(
    `DrinkQuest API listening on ${host}:${port} (${nodeEnv}) — Swagger /docs — APP_URL=${publicUrl} API_BASE_URL=${apiBaseUrl}`,
  );
}

bootstrap();
