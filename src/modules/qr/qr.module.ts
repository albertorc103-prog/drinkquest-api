import { Module } from '@nestjs/common';
import { BarsModule } from '../bars/bars.module';
import { BarMissionsModule } from '../bar-missions/bar-missions.module';
import { GlobalEventsModule } from '../global-events/global-events.module';
import { MissionsModule } from '../missions/missions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';

@Module({
  imports: [
    BarsModule,
    NotificationsModule,
    MissionsModule,
    BarMissionsModule,
    GlobalEventsModule,
    SubscriptionsModule,
  ],
  controllers: [QrController],
  providers: [QrService],
  exports: [QrService],
})
export class QrModule {}
