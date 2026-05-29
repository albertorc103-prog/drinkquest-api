import { SubscriptionStatus } from '@prisma/client';
import { BarAccessDenialReason } from './enums/bar-access-denial-reason.enum';
import {
  evaluatePromotionsAccess,
  evaluateQrAccess,
  evaluateSubscriptionActive,
} from './bar-access.rules';

const base = {
  canceledAt: null,
  qrEnabled: true,
  promoEnabled: true,
};

describe('bar-access.rules', () => {
  const now = new Date('2025-06-01T12:00:00.000Z');

  describe('evaluateSubscriptionActive', () => {
    it('permite TRIAL vigente', () => {
      const r = evaluateSubscriptionActive(
        {
          ...base,
          status: SubscriptionStatus.TRIAL,
          trialEndsAt: new Date('2025-06-15'),
          currentPeriodEnd: new Date('2025-06-15'),
        },
        now,
      );
      expect(r.allowed).toBe(true);
    });

    it('rechaza TRIAL expirado', () => {
      const r = evaluateSubscriptionActive(
        {
          ...base,
          status: SubscriptionStatus.TRIAL,
          trialEndsAt: new Date('2025-05-01'),
          currentPeriodEnd: new Date('2025-05-01'),
        },
        now,
      );
      expect(r).toMatchObject({
        allowed: false,
        reason: BarAccessDenialReason.TRIAL_EXPIRED,
      });
    });

    it('permite ACTIVE con periodo vigente', () => {
      const r = evaluateSubscriptionActive(
        {
          ...base,
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          currentPeriodEnd: new Date('2025-07-01'),
        },
        now,
      );
      expect(r.allowed).toBe(true);
    });

    it('rechaza ACTIVE con periodo vencido', () => {
      const r = evaluateSubscriptionActive(
        {
          ...base,
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          currentPeriodEnd: new Date('2025-05-01'),
        },
        now,
      );
      expect(r.reason).toBe(BarAccessDenialReason.SUBSCRIPTION_EXPIRED);
    });

    it('rechaza SUSPENDED', () => {
      const r = evaluateSubscriptionActive(
        {
          ...base,
          status: SubscriptionStatus.SUSPENDED,
          trialEndsAt: null,
          currentPeriodEnd: null,
        },
        now,
      );
      expect(r.reason).toBe(BarAccessDenialReason.SUBSCRIPTION_SUSPENDED);
    });

    it('rechaza sin fila de suscripción', () => {
      const r = evaluateSubscriptionActive(null, now);
      expect(r.reason).toBe(BarAccessDenialReason.SUBSCRIPTION_MISSING);
    });
  });

  describe('evaluateQrAccess', () => {
    it('rechaza si qrEnabled es false con suscripción activa', () => {
      const r = evaluateQrAccess(
        {
          ...base,
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          currentPeriodEnd: new Date('2025-07-01'),
          qrEnabled: false,
        },
        now,
      );
      expect(r.reason).toBe(BarAccessDenialReason.QR_DISABLED);
    });
  });

  describe('evaluatePromotionsAccess', () => {
    it('rechaza si promoEnabled es false', () => {
      const r = evaluatePromotionsAccess(
        {
          ...base,
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          currentPeriodEnd: new Date('2025-07-01'),
          promoEnabled: false,
        },
        now,
      );
      expect(r.reason).toBe(BarAccessDenialReason.PROMOTIONS_DISABLED);
    });
  });
});
