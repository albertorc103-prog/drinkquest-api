import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminSpecialDrinksController } from './admin-special-drinks.controller';
import { AdminSpecialDrinksService } from './admin-special-drinks.service';
import { BarSpecialDrinksController } from './bar-special-drinks.controller';
import { SpecialDrinksFeedController } from './special-drinks-feed.controller';
import { SpecialDrinksFeedService } from './special-drinks-feed.service';
import { SpecialDrinksService } from './special-drinks.service';

@Module({
  imports: [SubscriptionsModule, NotificationsModule],
  controllers: [
    BarSpecialDrinksController,
    AdminSpecialDrinksController,
    SpecialDrinksFeedController,
  ],
  providers: [SpecialDrinksService, AdminSpecialDrinksService, SpecialDrinksFeedService],
  exports: [SpecialDrinksService, AdminSpecialDrinksService],
})
export class SpecialDrinksModule {}
