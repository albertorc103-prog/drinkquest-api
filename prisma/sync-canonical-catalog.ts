/**
 * Sincroniza la tabla drinks con el catálogo oficial Vesper (100 bebidas, legacyId 1–100).
 * - Upsert por legacyId (nombre, imageKey, categoría, rareza)
 * - Soft-delete de bebidas fuera del catálogo canónico
 *
 * Uso: npm run catalog:sync
 */
import { PrismaClient } from '@prisma/client';
import { CATEGORIES, DEMO_DRINKS } from './data/catalog-drinks';

const prisma = new PrismaClient();

async function main() {
  for (const cat of CATEGORIES) {
    await prisma.drinkCategory.upsert({
      where: { slug: cat.slug },
      create: cat,
      update: { name: cat.name, sortOrder: cat.sortOrder, deletedAt: null },
    });
  }

  const categoryMap = Object.fromEntries(
    (await prisma.drinkCategory.findMany({ where: { deletedAt: null } })).map((c) => [c.slug, c.id]),
  );

  let upserted = 0;
  for (const d of DEMO_DRINKS) {
    const categoryId = categoryMap[d.categorySlug];
    if (!categoryId) throw new Error(`Missing category: ${d.categorySlug}`);

    await prisma.drink.upsert({
      where: { legacyId: d.legacyId },
      create: {
        legacyId: d.legacyId,
        slug: d.slug,
        name: d.name,
        categoryId,
        rarity: d.rarity,
        description: d.description,
        ingredients: d.ingredients,
        imageUrl: d.imageUrl || null,
        imageKey: d.imageKey,
        xpReward: d.xpReward,
        baseAlcohol: d.baseAlcohol,
        containsMezcal: d.containsMezcal ?? false,
        isPalomaFamily: d.isPalomaFamily ?? false,
        deletedAt: null,
      },
      update: {
        slug: d.slug,
        name: d.name,
        categoryId,
        rarity: d.rarity,
        description: d.description,
        ingredients: d.ingredients,
        imageKey: d.imageKey,
        xpReward: d.xpReward,
        containsMezcal: d.containsMezcal ?? false,
        isPalomaFamily: d.isPalomaFamily ?? false,
        deletedAt: null,
      },
    });
    upserted++;
  }

  const removed = await prisma.drink.updateMany({
    where: {
      deletedAt: null,
      sourceSpecialDrinkId: null,
      OR: [
        { legacyId: null },
        { legacyId: { lt: 1 } },
        { legacyId: { gt: 100 } },
      ],
    },
    data: { deletedAt: new Date() },
  });

  // Soft-delete set antiguo: nombres que no están en las 100 oficiales.
  const canonicalNames = new Set(DEMO_DRINKS.map((d) => d.name.trim().toLowerCase()));
  const staleNamed = await prisma.drink.findMany({
    where: { deletedAt: null, sourceSpecialDrinkId: null },
    select: { id: true, name: true },
  });
  const staleNamedIds = staleNamed
    .filter((row) => !canonicalNames.has(row.name.trim().toLowerCase()))
    .map((row) => row.id);
  const removedByName =
    staleNamedIds.length === 0
      ? { count: 0 }
      : await prisma.drink.updateMany({
          where: { id: { in: staleNamedIds } },
          data: { deletedAt: new Date() },
        });

  // Quitar del menú de bares cualquier bebida fuera del catálogo oficial.
  const staleMenu = await prisma.barMenuItem.updateMany({
    where: {
      deletedAt: null,
      OR: [
        { drink: { deletedAt: { not: null } } },
        { drink: { sourceSpecialDrinkId: null, legacyId: null } },
        { drink: { sourceSpecialDrinkId: null, legacyId: { lt: 1 } } },
        { drink: { sourceSpecialDrinkId: null, legacyId: { gt: 100 } } },
        ...(staleNamedIds.length > 0 ? [{ drinkId: { in: staleNamedIds } }] : []),
      ],
    },
    data: { deletedAt: new Date(), active: false },
  });

  const legacyMismatch = await prisma.drink.findMany({
    where: { deletedAt: null, legacyId: { not: null }, sourceSpecialDrinkId: null },
    select: { legacyId: true, name: true, imageKey: true },
    orderBy: { legacyId: 'asc' },
  });

  const expected = new Map(DEMO_DRINKS.map((d) => [d.legacyId, d]));
  const wrongName = legacyMismatch.filter((row) => {
    const exp = expected.get(row.legacyId!);
    return exp && exp.name !== row.name;
  });

  console.log(`✅ Catálogo canónico: ${upserted} bebidas actualizadas`);
  console.log(`🗑️  Bebidas fuera de 1–100 archivadas: ${removed.count}`);
  console.log(`🗑️  Bebidas con nombre fuera del set oficial: ${removedByName.count}`);
  console.log(`🗑️  Ítems de menú fuera de catálogo archivados: ${staleMenu.count}`);
  if (wrongName.length > 0) {
    console.warn('⚠️  Revisa nombres tras sync:', wrongName);
  } else {
    console.log('✅ Nombres alineados con canonical-catalog.json');
  }

  const active = await prisma.drink.count({
    where: {
      deletedAt: null,
      sourceSpecialDrinkId: null,
      legacyId: { gte: 1, lte: 100 },
    },
  });
  console.log(`📊 Bebidas activas en catálogo: ${active}`);
  if (active !== 100) {
    console.warn(`⚠️  Se esperaban 100 bebidas activas, hay ${active}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
