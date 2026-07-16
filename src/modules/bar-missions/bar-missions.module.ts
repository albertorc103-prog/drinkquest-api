import { Module, forwardRef } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BarMissionSeasonsController } from './bar-mission-seasons.controller';
import { BarMissionsService } from './bar-missions.service';
import { UserBarMissionsController } from './user-bar-missions.controller';

@Module({
  imports: [SubscriptionsModule, NotificationsModule, forwardRef(() => ReservationsModule)],
  controllers: [BarMissionSeasonsController, UserBarMissionsController],
  providers: [BarMissionsService],
  exports: [BarMissionsService],
})
export class BarMissionsModule {}
