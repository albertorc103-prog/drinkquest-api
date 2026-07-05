import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: Stripe | null;

  constructor(private readonly config: ConfigService) {
    const secret = this.config.get<string>('STRIPE_SECRET_KEY')?.trim();
    this.client = secret ? new Stripe(secret) : null;
  }

  enabled(): boolean {
    return this.client != null;
  }

  requireClient(): Stripe {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Pagos Stripe no configurados. Contacta con soporte DrinkQuest.',
      );
    }
    return this.client;
  }

  webhookSecret(): string {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException('Webhook Stripe no configurado.');
    }
    return secret;
  }

  checkoutSuccessUrl(): string {
    return (
      this.config.get<string>('STRIPE_CHECKOUT_SUCCESS_URL')?.trim() ||
      'drinkquest://business/subscription?status=success&session_id={CHECKOUT_SESSION_ID}'
    );
  }

  checkoutCancelUrl(): string {
    return (
      this.config.get<string>('STRIPE_CHECKOUT_CANCEL_URL')?.trim() ||
      'drinkquest://business/subscription?status=cancel'
    );
  }

  logDisabledOnce(context: string) {
    this.logger.warn(`Stripe deshabilitado — ${context}`);
  }
}
