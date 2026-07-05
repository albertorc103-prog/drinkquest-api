import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import Stripe from 'stripe';
import { StripeService } from './stripe.service';
import { StripeSubscriptionSyncService } from './stripe-subscription-sync.service';

@ApiExcludeController()
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly sync: StripeSubscriptionSyncService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    const client = this.stripe.requireClient();
    const secret = this.stripe.webhookSecret();
    const rawBody = req.rawBody;
    if (!rawBody || !signature) {
      this.logger.warn('Webhook Stripe sin rawBody o firma');
      return { received: false };
    }

    let event: Stripe.Event;
    try {
      event = client.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      this.logger.warn(`Firma webhook inválida: ${(err as Error).message}`);
      return { received: false };
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const sub = await client.subscriptions.retrieve(String(session.subscription));
          await this.sync.applyStripeSubscription(sub, session.metadata?.barId);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await this.sync.applyStripeSubscription(sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await this.sync.applyStripeSubscription(sub);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const sub = await client.subscriptions.retrieve(String(invoice.subscription));
          await this.sync.markPastDue(sub);
        }
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const sub = await client.subscriptions.retrieve(String(invoice.subscription));
          await this.sync.applyStripeSubscription(sub);
        }
        break;
      }
      default:
        break;
    }

    return { received: true };
  }
}
