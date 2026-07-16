import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminRooftopController } from './admin-rooftop.controller';
import { AdminRooftopService } from './admin-rooftop.service';
import { BarRooftopPackagesController } from './bar-rooftop-packages.controller';
import { RooftopFeedController } from './rooftop-feed.controller';
import { RooftopFeedService } from './rooftop-feed.service';
import { RooftopPackagesService } from './rooftop-packages.service';

@Module({
  imports: [SubscriptionsModule, NotificationsModule],
  controllers: [
    BarRooftopPackagesController,
    AdminRooftopController,
    RooftopFeedController,
  ],
  providers: [RooftopPackagesService, AdminRooftopService, RooftopFeedService],
  exports: [RooftopPackagesService, AdminRooftopService],
})
export class RooftopModule {}
