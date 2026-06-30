type AdminBarSubscriptionSlice = {
  status: string;
  plan: string;
  qrEnabled: boolean;
  promoEnabled: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
};

export type AdminBarRecord = {
  id: string;
  businessName: string;
  slug: string;
  description: string | null;
  city: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  owner: { email: string; displayName: string } | null;
  subscription: AdminBarSubscriptionSlice | null;
};

function mapSubscription(sub: AdminBarSubscriptionSlice | null) {
  if (!sub) return null;
  return {
    status: sub.status,
    plan: sub.plan,
    qrEnabled: sub.qrEnabled,
    promoEnabled: sub.promoEnabled,
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
  };
}

/** Respuesta plana + nested subscription para clientes móviles. */
export function mapAdminBarRow(bar: AdminBarRecord) {
  const subscription = mapSubscription(bar.subscription);
  return {
    id: bar.id,
    businessName: bar.businessName,
    slug: bar.slug,
    description: bar.description,
    city: bar.city,
    logoUrl: bar.logoUrl,
    bannerUrl: bar.bannerUrl,
    owner: bar.owner,
    subscription,
    status: subscription?.status ?? null,
    plan: subscription?.plan ?? null,
    qrEnabled: subscription?.qrEnabled ?? null,
    promoEnabled: subscription?.promoEnabled ?? null,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
  };
}
