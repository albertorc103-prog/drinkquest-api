import { BarSubscription, SubscriptionStatus } from '@prisma/client';
import { BarAccessDenialReason } from './enums/bar-access-denial-reason.enum';
import { AccessDecision } from './interfaces/access-decision.interface';

export type SubscriptionSlice = Pick<
  BarSubscription,
  'status' | 'trialEndsAt' | 'currentPeriodEnd' | 'canceledAt' | 'qrEnabled' | 'promoEnabled'
>;

const MESSAGES: Record<BarAccessDenialReason, string> = {
  [BarAccessDenialReason.BAR_NOT_FOUND]: 'Local no encontrado o no autorizado.',
  [BarAccessDenialReason.SUBSCRIPTION_MISSING]:
    'Este local no tiene suscripción activa. Contacta con soporte.',
  [BarAccessDenialReason.SUBSCRIPTION_SUSPENDED]:
    'Tu local está suspendido. Renueva o contacta con soporte para reactivar el acceso.',
  [BarAccessDenialReason.SUBSCRIPTION_CANCELED]:
    'La suscripción de este local fue cancelada.',
  [BarAccessDenialReason.SUBSCRIPTION_PAST_DUE]:
    'La suscripción tiene pagos pendientes. Regulariza el plan para continuar.',
  [BarAccessDenialReason.SUBSCRIPTION_EXPIRED]:
    'La suscripción ha vencido. Renueva tu plan para seguir usando la plataforma.',
  [BarAccessDenialReason.TRIAL_EXPIRED]:
    'El periodo de prueba ha finalizado. Activa un plan para continuar.',
  [BarAccessDenialReason.QR_DISABLED]:
    'La generación de códigos QR está deshabilitada para este local.',
  [BarAccessDenialReason.PROMOTIONS_DISABLED]:
    'Las promociones están deshabilitadas para este local.',
};

export function denial(reason: BarAccessDenialReason): AccessDecision {
  return { allowed: false, reason, message: MESSAGES[reason] };
}

export function allow(): AccessDecision {
  return { allowed: true };
}

/** Suscripción en buen estado (trial vigente o plan activo no vencido). */
export function evaluateSubscriptionActive(
  subscription: SubscriptionSlice | null,
  now: Date = new Date(),
): AccessDecision {
  if (!subscription) {
    return denial(BarAccessDenialReason.SUBSCRIPTION_MISSING);
  }

  switch (subscription.status) {
    case SubscriptionStatus.SUSPENDED:
      return denial(BarAccessDenialReason.SUBSCRIPTION_SUSPENDED);
    case SubscriptionStatus.CANCELED:
      return denial(BarAccessDenialReason.SUBSCRIPTION_CANCELED);
    case SubscriptionStatus.PAST_DUE:
      return denial(BarAccessDenialReason.SUBSCRIPTION_PAST_DUE);
    case SubscriptionStatus.TRIAL:
      if (subscription.trialEndsAt && subscription.trialEndsAt < now) {
        return denial(BarAccessDenialReason.TRIAL_EXPIRED);
      }
      return allow();
    case SubscriptionStatus.ACTIVE:
      if (subscription.currentPeriodEnd && subscription.currentPeriodEnd < now) {
        return denial(BarAccessDenialReason.SUBSCRIPTION_EXPIRED);
      }
      return allow();
    default:
      return denial(BarAccessDenialReason.SUBSCRIPTION_MISSING);
  }
}

export function evaluateQrAccess(
  subscription: SubscriptionSlice | null,
  now: Date = new Date(),
): AccessDecision {
  const base = evaluateSubscriptionActive(subscription, now);
  if (!base.allowed) return base;
  if (!subscription!.qrEnabled) {
    return denial(BarAccessDenialReason.QR_DISABLED);
  }
  return allow();
}

export function evaluatePromotionsAccess(
  subscription: SubscriptionSlice | null,
  now: Date = new Date(),
): AccessDecision {
  const base = evaluateSubscriptionActive(subscription, now);
  if (!base.allowed) return base;
  if (!subscription!.promoEnabled) {
    return denial(BarAccessDenialReason.PROMOTIONS_DISABLED);
  }
  return allow();
}
