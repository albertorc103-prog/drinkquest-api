import {
  Prisma,
  RooftopPackageApprovalStatus,
  RooftopPackageStatus,
  RooftopVerificationStatus,
  SubscriptionPlan,
} from '@prisma/client';

/** Filtro Prisma alineado con GET /rooftop/feed (paquetes aprobados no vencidos). */
export function buildRooftopUserFeedWhere(now: Date = new Date()): Prisma.BarRooftopPackageWhereInput {
  return {
    deletedAt: null,
    approvalStatus: RooftopPackageApprovalStatus.APPROVED,
    status: RooftopPackageStatus.ACTIVE,
    endsAt: { gt: now },
    bar: {
      deletedAt: null,
      isActive: true,
      rooftopStatus: RooftopVerificationStatus.APPROVED,
      hasOutdoorSpace: true,
      subscription: {
        plan: SubscriptionPlan.LEGEND,
        OR: [
          {
            status: 'TRIAL' as const,
            OR: [{ trialEndsAt: null }, { trialEndsAt: { gte: now } }],
          },
          {
            status: 'ACTIVE' as const,
            OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: now } }],
          },
        ],
      },
    },
  };
}
