import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const promoId = process.argv[3]?.trim();

  const now = new Date();

  let promos = await prisma.barPromotion.findMany({
    orderBy: { updatedAt: 'desc' },
    take: email || promoId ? 20 : 10,
    where: promoId
      ? { id: promoId }
      : email
        ? { bar: { owner: { email } } }
        : undefined,
    include: {
      bar: {
        select: {
          id: true,
          businessName: true,
          isActive: true,
          deletedAt: true,
          subscription: {
            select: {
              status: true,
              promoEnabled: true,
              trialEndsAt: true,
              currentPeriodEnd: true,
            },
          },
        },
      },
    },
  });

  if (promos.length === 0) {
    console.log('No se encontraron promociones con ese criterio.');
    console.log('Uso: npx ts-node prisma/inspect-promotion-feed.ts [ownerEmail] [promotionId]');
    return;
  }

  console.log(`now (UTC): ${now.toISOString()}\n`);

  for (const p of promos) {
    const sub = p.bar.subscription;
    const subMatches = sub
      ? (sub.promoEnabled === true &&
          ((sub.status === 'TRIAL' &&
            (sub.trialEndsAt == null || sub.trialEndsAt >= now)) ||
            (sub.status === 'ACTIVE' &&
              (sub.currentPeriodEnd == null || sub.currentPeriodEnd >= now))))
      : false;

    const feedOk =
      p.status === 'ACTIVE' &&
      p.approvalStatus === 'APPROVED' &&
      p.startsAt <= now &&
      p.endsAt > now &&
      p.bar.deletedAt == null &&
      p.bar.isActive === true &&
      subMatches;

    console.log('---');
    console.log(`id: ${p.id}`);
    console.log(`approvalStatus: ${p.approvalStatus}`);
    console.log(`status: ${p.status}`);
    console.log(`startsAt: ${p.startsAt.toISOString()}`);
    console.log(`endsAt: ${p.endsAt.toISOString()}`);
    console.log(`barId: ${p.barId}`);
    console.log(`bar: ${p.bar.businessName} (isActive=${p.bar.isActive}, deleted=${p.bar.deletedAt != null})`);
    if (!sub) {
      console.log('subscription: (ninguna)');
    } else {
      console.log(
        `subscription: status=${sub.status}, promoEnabled=${sub.promoEnabled}, trialEndsAt=${sub.trialEndsAt?.toISOString() ?? 'null'}, currentPeriodEnd=${sub.currentPeriodEnd?.toISOString() ?? 'null'}`,
      );
    }
    console.log(`promoEnabled + suscripción activa: ${subMatches}`);
    console.log(`¿Pasa filtro feed completo?: ${feedOk}`);
    console.log('Checks feed:');
    console.log(`  status === ACTIVE: ${p.status === 'ACTIVE'}`);
    console.log(`  approvalStatus === APPROVED: ${p.approvalStatus === 'APPROVED'}`);
    console.log(`  startsAt <= now: ${p.startsAt <= now}`);
    console.log(`  endsAt > now: ${p.endsAt > now}`);
    console.log(`  bar activo: ${p.bar.deletedAt == null && p.bar.isActive}`);
    console.log(`  suscripción promos: ${subMatches}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
