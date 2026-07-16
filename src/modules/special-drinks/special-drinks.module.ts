import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminSpecialDrinksController } from './admin-special-drinks.controller';
import { AdminSpecialDrinksService } from './admin-special-drinks.service';
import { BarSpecialDrinksController } from './bar-special-drinks.controller';
import { SpecialDrinksService } from './special-drinks.service';

@Module({
  imports: [SubscriptionsModule],
  controllers: [BarSpecialDrinksController, AdminSpecialDrinksController],
  providers: [SpecialDrinksService, AdminSpecialDrinksService],
  exports: [SpecialDrinksService, AdminSpecialDrinksService],
})
export class SpecialDrinksModule {}
