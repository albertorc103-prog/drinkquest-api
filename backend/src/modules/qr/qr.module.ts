import { Module } from '@nestjs/common';
import { BarsModule } from '../bars/bars.module';
import { MissionsModule } from '../missions/missions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';

@Module({
  imports: [BarsModule, NotificationsModule, MissionsModule, SubscriptionsModule],
  controllers: [QrController],
  providers: [QrService],
  exports: [QrService],
})
export class QrModule {}
