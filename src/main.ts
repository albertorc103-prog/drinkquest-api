import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as compression from 'compression';
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

  if (nodeEnv === 'production') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // Version lives in API_PREFIX (e.g. api/v1). Do not enable URI versioning — it would duplicate /v1.
  app.setGlobalPrefix(prefix);
  app.use(helmet());
  app.use(compression());

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
