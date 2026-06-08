import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminPromotionsController } from './admin-promotions.controller';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, SubscriptionsModule, PromotionsModule],
  controllers: [AdminController, AdminSubscriptionsController, AdminPromotionsController],
  providers: [AdminService],
})
export class AdminModule {}
