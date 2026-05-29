import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/common/utils/crypto.util';
import { CATEGORIES, DEMO_DRINKS } from './data/catalog-drinks';

const prisma = new PrismaClient();

async function seedDemoDrinksIfEmpty(): Promise<number> {
  const drinkCount = await prisma.drink.count({ where: { deletedAt: null } });
  if (drinkCount > 0) {
    console.log(`⏭️  Drinks table already has ${drinkCount} records — skipping demo drinks.`);
    return 0;
  }

  for (const cat of CATEGORIES) {
    await prisma.drinkCategory.upsert({
      where: { slug: cat.slug },
      create: cat,
      update: { name: cat.name, sortOrder: cat.sortOrder },
    });
  }

  const categoryMap = Object.fromEntries(
    (await prisma.drinkCategory.findMany({ where: { deletedAt: null } })).map((c: { slug: string; id: string }) => [
      c.slug,
      c.id,
    ]),
  );

  for (const d of DEMO_DRINKS) {
    const categoryId = categoryMap[d.categorySlug];
    if (!categoryId) {
      throw new Error(`Missing category slug: ${d.categorySlug}`);
    }

    await prisma.drink.create({
      data: {
        legacyId: d.legacyId,
        slug: d.slug,
        name: d.name,
        categoryId,
        rarity: d.rarity,
        description: d.description,
        ingredients: d.ingredients,
        imageUrl: d.imageUrl,
        imageKey: `drink_${d.slug}`,
        xpReward: d.xpReward,
        baseAlcohol: d.baseAlcohol,
        containsMezcal: d.containsMezcal ?? false,
        isPalomaFamily: d.isPalomaFamily ?? false,
      },
    });
  }

  console.log(`✅ Seeded ${DEMO_DRINKS.length} demo drinks across ${CATEGORIES.length} categories.`);
  return DEMO_DRINKS.length;
}

async function seedMissionsAndAchievements(): Promise<void> {
  const missions = [
    {
      slug: 'first-qr',
      title: 'Primer escaneo',
      description: 'Escanea tu primer QR en un bar',
      triggerKey: 'first_unlock',
      targetCount: 1,
      xpReward: 50,
    },
    {
      slug: 'qr-explorer',
      title: 'Explorador',
      description: 'Escanea 5 códigos QR',
      triggerKey: 'qr_unlock',
      targetCount: 5,
      xpReward: 150,
    },
    {
      slug: 'social-butterfly',
      title: 'Mariposa social',
      description: 'Consigue 3 amigos',
      triggerKey: 'friend_count',
      targetCount: 3,
      xpReward: 100,
    },
  ];
  for (const m of missions) {
    await prisma.mission.upsert({
      where: { slug: m.slug },
      create: m,
      update: m,
    });
  }

  const achievements = [
    {
      slug: 'first-drink',
      title: 'Primera copa',
      description: 'Desbloquea tu primera bebida',
      triggerKey: 'first_unlock',
      xpReward: 100,
    },
    {
      slug: 'collector-10',
      title: 'Coleccionista',
      description: '10 bebidas desbloqueadas',
      triggerKey: 'unlock_count_10',
      xpReward: 250,
    },
  ];
  for (const a of achievements) {
    await prisma.achievement.upsert({
      where: { slug: a.slug },
      create: a,
      update: a,
    });
  }
}

async function seedAdminUser(): Promise<string> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@drinkquest.app';
  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMeAdmin123!';
  const passwordHash = await hashPassword(adminPass);
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash,
      displayName: 'DrinkQuest Admin',
      role: Role.SUPER_ADMIN,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
    // Idempotente: no sobrescribe passwordHash si el admin ya existe (evita resets en cada deploy).
    update: {
      role: Role.SUPER_ADMIN,
      displayName: 'DrinkQuest Admin',
      emailVerified: true,
      emailVerifiedAt: existing?.emailVerifiedAt ?? new Date(),
    },
  });
  console.log(`✅ Admin listo: ${adminEmail} (${existing ? 'actualizado' : 'creado'})`);
  return adminEmail;
}

async function main() {
  console.log('🌱 Seeding DrinkQuest...');

  const drinksSeeded = await seedDemoDrinksIfEmpty();
  await seedMissionsAndAchievements();
  const adminEmail = await seedAdminUser();

  console.log(`✅ Seed complete — drinks added: ${drinksSeeded}, admin: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
