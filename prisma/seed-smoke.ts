import {
  PrismaClient,
  PromotionApprovalStatus,
  PromotionStatus,
  Role,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { hashPassword, slugify } from '../src/common/utils/crypto.util';

const prisma = new PrismaClient();

const PASSWORDS = {
  admin: 'SmokeAdmin123!',
  barActive: 'SmokeBarActive123!',
  barSuspended: 'SmokeBarSusp123!',
  barTrialExpired: 'SmokeBarTrial123!',
  user: 'SmokeUser123!',
};

async function upsertUser(email: string, displayName: string, role: Role, password: string) {
  const passwordHash = await hashPassword(password);
  return prisma.user.upsert({
    where: { email },
    create: {
      email,
      displayName,
      role,
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
    update: {
      displayName,
      role,
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      deletedAt: null,
    },
  });
}

async function ensureBar(ownerUserId: string, businessName: string) {
  const slug = slugify(businessName);
  return prisma.bar.upsert({
    where: { ownerUserId },
    create: {
      ownerUserId,
      businessName,
      slug,
      isActive: true,
    },
    update: {
      businessName,
      slug,
      isActive: true,
      deletedAt: null,
    },
  });
}

async function ensureSubscription(
  barId: string,
  status: SubscriptionStatus,
  overrides?: Partial<{
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    qrEnabled: boolean;
    promoEnabled: boolean;
  }>,
) {
  const now = new Date();
  return prisma.barSubscription.upsert({
    where: { barId },
    create: {
      barId,
      status,
      plan: SubscriptionPlan.BASIC,
      trialEndsAt: overrides?.trialEndsAt ?? new Date(now.getTime() + 7 * 86400_000),
      currentPeriodEnd: overrides?.currentPeriodEnd ?? new Date(now.getTime() + 30 * 86400_000),
      qrEnabled: overrides?.qrEnabled ?? true,
      promoEnabled: overrides?.promoEnabled ?? true,
    },
    update: {
      status,
      plan: SubscriptionPlan.BASIC,
      trialEndsAt: overrides?.trialEndsAt ?? new Date(now.getTime() + 7 * 86400_000),
      currentPeriodEnd: overrides?.currentPeriodEnd ?? new Date(now.getTime() + 30 * 86400_000),
      qrEnabled: overrides?.qrEnabled ?? true,
      promoEnabled: overrides?.promoEnabled ?? true,
      canceledAt: null,
    },
  });
}

async function ensureBarMenu(barId: string) {
  const drink = await prisma.drink.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' } });
  if (!drink) throw new Error('No hay drinks para smoke test. Ejecuta seed base primero.');
  await prisma.barMenuItem.upsert({
    where: { barId_drinkId: { barId, drinkId: drink.id } },
    create: { barId, drinkId: drink.id, active: true, featured: true },
    update: { active: true, featured: true, deletedAt: null },
  });
  return drink.id;
}

async function ensurePromotion(
  barId: string,
  slug: string,
  status: PromotionStatus,
  approvalStatus: PromotionApprovalStatus,
  startsAt: Date,
  endsAt: Date,
  rejectionReason?: string,
) {
  const title = `Smoke ${slug}`;
  const existing = await prisma.barPromotion.findFirst({ where: { barId, title } });
  if (existing) {
    return prisma.barPromotion.update({
      where: { id: existing.id },
      data: {
        title,
        description: `Promo ${slug} para smoke tests`,
        status,
        approvalStatus,
        startsAt,
        endsAt,
        rejectionReason: rejectionReason ?? null,
      },
    });
  }
  return prisma.barPromotion.create({
    data: {
      barId,
      title,
      description: `Promo ${slug} para smoke tests`,
      startsAt,
      endsAt,
      status,
      approvalStatus,
      priority: 5,
      rejectionReason: rejectionReason ?? null,
    },
  });
}

async function main() {
  const now = new Date();
  const past = new Date(now.getTime() - 2 * 86400_000);
  const future = new Date(now.getTime() + 2 * 86400_000);

  const admin = await upsertUser('smoke.admin@drinkquest.app', 'Smoke Admin', Role.SUPER_ADMIN, PASSWORDS.admin);
  const barActiveUser = await upsertUser('smoke.bar.active@drinkquest.app', 'Smoke Bar Active', Role.BAR, PASSWORDS.barActive);
  const barSuspUser = await upsertUser('smoke.bar.suspended@drinkquest.app', 'Smoke Bar Suspended', Role.BAR, PASSWORDS.barSuspended);
  const barTrialUser = await upsertUser('smoke.bar.trialexpired@drinkquest.app', 'Smoke Bar Trial', Role.BAR, PASSWORDS.barTrialExpired);
  const user = await upsertUser('smoke.user@drinkquest.app', 'Smoke User', Role.USER, PASSWORDS.user);

  const barActive = await ensureBar(barActiveUser.id, 'Smoke Bar Active');
  const barSusp = await ensureBar(barSuspUser.id, 'Smoke Bar Suspended');
  const barTrial = await ensureBar(barTrialUser.id, 'Smoke Bar Trial Expired');

  await ensureSubscription(barActive.id, SubscriptionStatus.ACTIVE, {
    trialEndsAt: null,
    currentPeriodEnd: new Date(now.getTime() + 15 * 86400_000),
    qrEnabled: true,
    promoEnabled: true,
  });
  await ensureSubscription(barSusp.id, SubscriptionStatus.SUSPENDED, {
    trialEndsAt: null,
    currentPeriodEnd: new Date(now.getTime() + 15 * 86400_000),
    qrEnabled: false,
    promoEnabled: false,
  });
  await ensureSubscription(barTrial.id, SubscriptionStatus.TRIAL, {
    trialEndsAt: new Date(now.getTime() - 86400_000),
    currentPeriodEnd: new Date(now.getTime() - 86400_000),
    qrEnabled: true,
    promoEnabled: true,
  });

  await ensureBarMenu(barActive.id);
  await ensureBarMenu(barSusp.id);
  await ensureBarMenu(barTrial.id);

  await ensurePromotion(
    barActive.id,
    'APPROVED',
    PromotionStatus.ACTIVE,
    PromotionApprovalStatus.APPROVED,
    past,
    future,
  );
  await ensurePromotion(
    barActive.id,
    'PENDING_REVIEW',
    PromotionStatus.DRAFT,
    PromotionApprovalStatus.PENDING_REVIEW,
    now,
    future,
  );
  await ensurePromotion(
    barActive.id,
    'REJECTED',
    PromotionStatus.PAUSED,
    PromotionApprovalStatus.REJECTED,
    now,
    future,
    'Contenido no cumple lineamientos',
  );
  await ensurePromotion(
    barActive.id,
    'FLAGGED',
    PromotionStatus.PAUSED,
    PromotionApprovalStatus.FLAGGED,
    now,
    future,
    'Revisión manual requerida',
  );
  await ensurePromotion(
    barActive.id,
    'EXPIRED',
    PromotionStatus.EXPIRED,
    PromotionApprovalStatus.APPROVED,
    new Date(now.getTime() - 10 * 86400_000),
    new Date(now.getTime() - 5 * 86400_000),
  );

  console.log('✅ Smoke seed listo');
  console.log(JSON.stringify({
    admin: { email: admin.email, password: PASSWORDS.admin },
    barActive: { email: barActiveUser.email, password: PASSWORDS.barActive },
    barSuspended: { email: barSuspUser.email, password: PASSWORDS.barSuspended },
    barTrialExpired: { email: barTrialUser.email, password: PASSWORDS.barTrialExpired },
    user: { email: user.email, password: PASSWORDS.user },
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());

