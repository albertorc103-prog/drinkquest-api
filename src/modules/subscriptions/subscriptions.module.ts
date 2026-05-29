import { Module } from '@nestjs/common';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { BarAccessService } from './bar-access.service';
import { BarAccessStateService } from './bar-access-state.service';
import { BarSubscriptionService } from './bar-subscription.service';
import { JwtBarClaimsService } from './jwt-bar-claims.service';

@Module({
  providers: [
    BarSubscriptionService,
    BarAccessService,
    AdminSubscriptionsService,
    BarAccessStateService,
    JwtBarClaimsService,
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
