import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { RedisModule } from '../redis/redis.module';
import { HealthController } from './health.controller';

@Module({
  imports: [RedisModule, NotificationsModule],
  controllers: [HealthController],
})
export class HealthModule {}
