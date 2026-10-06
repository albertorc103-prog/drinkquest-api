import { Module, forwardRef } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';
import { AdminBarMissionMedalController } from './admin-bar-mission-medal.controller';
import { AdminBarMissionMedalService } from './admin-bar-mission-medal.service';
import { BarMissionMedalActiveResolver } from './bar-mission-medal-active.resolver';
import { BarMissionMedalActivityService } from './bar-mission-medal-activity.service';
import { BarMissionMedalController } from './bar-mission-medal.controller';
import { BarMissionMedalProgressService } from './bar-mission-medal-progress.service';
import { BarMissionMedalPublicService } from './bar-mission-medal-public.service';
import { BarMissionMedalService } from './bar-mission-medal.service';
import { BarMissionMedalStatsService } from './bar-mission-medal-stats.service';
import { BarMissionMedalUnlockService } from './bar-mission-medal-unlock.service';
import { BarMissionSeasonsController } from './bar-mission-seasons.controller';
import { BarMissionsService } from './bar-missions.service';
import {
  PublicBarMedalController,
  UserBarMedalsController,
} from './public-bar-medal.controller';
import { UserBarMissionsController } from './user-bar-missions.controller';

@Module({
  imports: [
    SubscriptionsModule,
    NotificationsModule,
    UsersModule,
    forwardRef(() => ReservationsModule),
  ],
  controllers: [
    BarMissionSeasonsController,
    BarMissionMedalController,
    PublicBarMedalController,
    UserBarMedalsController,
    UserBarMissionsController,
    AdminBarMissionMedalController,
  ],
  providers: [
    BarMissionsService,
    BarMissionMedalService,
    AdminBarMissionMedalService,
    BarMissionMedalActiveResolver,
    BarMissionMedalProgressService,
    BarMissionMedalUnlockService,
    BarMissionMedalActivityService,
    BarMissionMedalPublicService,
    BarMissionMedalStatsService,
  ],
  exports: [
    BarMissionsService,
    BarMissionMedalService,
    BarMissionMedalProgressService,
    BarMissionMedalActiveResolver,
    BarMissionMedalActivityService,
    BarMissionMedalUnlockService,
    BarMissionMedalPublicService,
    BarMissionMedalStatsService,
  ],
})
export class BarMissionsModule {}
