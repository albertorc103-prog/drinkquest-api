import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BarStripeCheckoutService } from './bar-stripe-checkout.service';
import { StripeService } from './stripe.service';
import { StripeSubscriptionSyncService } from './stripe-subscription-sync.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [SubscriptionsModule],
  controllers: [StripeWebhookController],
  providers: [StripeService, BarStripeCheckoutService, StripeSubscriptionSyncService],
  exports: [StripeService, BarStripeCheckoutService, StripeSubscriptionSyncService],
})
export class PaymentsModule {}
