import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminPromotionModerationService } from './admin-promotion-moderation.service';
import { BarPromotionsController } from './bar-promotions.controller';
import { PromotionAnalyticsController } from './promotion-analytics.controller';
import { PromotionAnalyticsService } from './promotion-analytics.service';
import { PromotionFeedController } from './promotion-feed.controller';
import { PromotionFeedService } from './promotion-feed.service';
import { PromotionService } from './promotion.service';

@Module({
  imports: [SubscriptionsModule, NotificationsModule],
  controllers: [BarPromotionsController, PromotionFeedController, PromotionAnalyticsController],
  providers: [
    PromotionService,
    PromotionFeedService,
    PromotionAnalyticsService,
    AdminPromotionModerationService,
  ],
  exports: [
    PromotionService,
    PromotionFeedService,
    PromotionAnalyticsService,
    AdminPromotionModerationService,
  ],
})
export class PromotionsModule {}
