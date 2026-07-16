import { Module, forwardRef } from '@nestjs/common';
import { BarMissionsModule } from '../bar-missions/bar-missions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BarReservationsController } from './bar-reservations.controller';
import { ReservationsService } from './reservations.service';
import { UserReservationsController } from './user-reservations.controller';

@Module({
  imports: [SubscriptionsModule, NotificationsModule, forwardRef(() => BarMissionsModule)],
  controllers: [UserReservationsController, BarReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
