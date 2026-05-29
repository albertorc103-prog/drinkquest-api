import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './app.config';
import authConfig from './auth.config';
import databaseConfig from './database.config';
import minioConfig from './minio.config';
import redisConfig from './redis.config';
import smtpConfig from './smtp.config';
import subscriptionConfig from './subscription.config';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      load: [
        appConfig,
        authConfig,
        databaseConfig,
        redisConfig,
        minioConfig,
        smtpConfig,
        subscriptionConfig,
      ],
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
