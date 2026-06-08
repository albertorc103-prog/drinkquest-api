/**
 * Sincroniza promos APPROVED para el feed de cliente (misma lógica que POST /admin/promotions/sync-feed).
 * Uso: npm run promo:publish-now
 */
import { PrismaClient, PromotionApprovalStatus, PromotionStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();

  const activated = await prisma.barPromotion.updateMany({
    where: {
      approvalStatus: PromotionApprovalStatus.APPROVED,
      endsAt: { gt: now },
      status: { not: PromotionStatus.ACTIVE },
    },
    data: { status: PromotionStatus.ACTIVE },
  });

  const startsAdjusted = await prisma.barPromotion.updateMany({
    where: {
      approvalStatus: PromotionApprovalStatus.APPROVED,
      endsAt: { gt: now },
      startsAt: { gt: now },
    },
    data: { startsAt: now },
  });

  const feedVisible = await prisma.barPromotion.count({
    where: {
      status: PromotionStatus.ACTIVE,
      approvalStatus: PromotionApprovalStatus.APPROVED,
      startsAt: { lte: now },
      endsAt: { gt: now },
      bar: {
        deletedAt: null,
        isActive: true,
        subscription: {
          promoEnabled: true,
          OR: [
            {
              status: 'TRIAL',
              OR: [{ trialEndsAt: null }, { trialEndsAt: { gte: now } }],
            },
            {
              status: 'ACTIVE',
              OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: now } }],
            },
          ],
        },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        activatedCount: activated.count,
        startsAtAdjustedCount: startsAdjusted.count,
        feedVisibleCount: feedVisible,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
