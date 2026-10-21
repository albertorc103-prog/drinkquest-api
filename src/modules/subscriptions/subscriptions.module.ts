import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { BarAccessService } from './bar-access.service';
import { BarAccessStateService } from './bar-access-state.service';
import { BarSubscriptionService } from './bar-subscription.service';
import { JwtBarClaimsService } from './jwt-bar-claims.service';
import { LegendMedalEligibilityNotifyService } from './legend-medal-eligibility-notify.service';

@Module({
  imports: [NotificationsModule],
  providers: [
    BarSubscriptionService,
    BarAccessService,
    AdminSubscriptionsService,
    BarAccessStateService,
    JwtBarClaimsService,
    LegendMedalEligibilityNotifyService,
  ],
  exports: [
    BarSubscriptionService,
    BarAccessService,
    AdminSubscriptionsService,
    BarAccessStateService,
    JwtBarClaimsService,
  ],
})
export class SubscriptionsModule {}
