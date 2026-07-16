import { DrinkRarity, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

type SpecialDrinkSource = {
  id: string;
  barId: string;
  name: string;
  recipe: string;
  funFact: string;
  imageUrl: string;
};

type Tx = Prisma.TransactionClient | PrismaService;

/** Resuelve o crea la categoría cocktails (sección Cócteles). */
export async function ensureCocktailsCategoryId(db: Tx): Promise<string> {
  const existing = await db.drinkCategory.findFirst({
    where: { slug: 'cocktails', deletedAt: null },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await db.drinkCategory.create({
    data: { slug: 'cocktails', name: 'Cocktails', sortOrder: 1 },
  });
  return created.id;
}

/**
 * Materializa / sincroniza un Drink + BarMenuItem a partir de una bebida especializada aprobada.
 * El Drink queda fuera del catálogo canónico (legacyId null + sourceSpecialDrinkId).
 */
export async function materializeSpecialDrink(db: Tx, special: SpecialDrinkSource) {
  const categoryId = await ensureCocktailsCategoryId(db);
  const slug = `special-${special.id}`;

  const existing = await db.drink.findFirst({
    where: { sourceSpecialDrinkId: special.id },
  });

  const drink = existing
    ? await db.drink.update({
        where: { id: existing.id },
        data: {
          name: special.name.trim(),
          imageUrl: special.imageUrl,
          description: special.funFact.trim(),
          ingredients: special.recipe.trim(),
          rarity: DrinkRarity.COMMON,
          xpReward: 10,
          categoryId,
          originBarId: special.barId,
          deletedAt: null,
          legacyId: null,
          slug,
        },
      })
    : await db.drink.create({
        data: {
          slug,
          name: special.name.trim(),
          categoryId,
          rarity: DrinkRarity.COMMON,
          imageUrl: special.imageUrl,
          description: special.funFact.trim(),
          ingredients: special.recipe.trim(),
          xpReward: 10,
          legacyId: null,
          sourceSpecialDrinkId: special.id,
          originBarId: special.barId,
        },
      });

  await db.barMenuItem.upsert({
    where: { barId_drinkId: { barId: special.barId, drinkId: drink.id } },
    create: {
      barId: special.barId,
      drinkId: drink.id,
      active: true,
      featured: true,
      sortOrder: 0,
    },
    update: {
      active: true,
      featured: true,
      deletedAt: null,
    },
  });

  return drink;
}

/** Desactiva el menú QR de una especial (reject / flag / delete / re-review). */
export async function deactivateSpecialDrinkMenu(db: Tx, specialDrinkId: string) {
  const drink = await db.drink.findFirst({
    where: { sourceSpecialDrinkId: specialDrinkId },
    select: { id: true, originBarId: true },
  });
  if (!drink?.originBarId) return;
  await db.barMenuItem.updateMany({
    where: { barId: drink.originBarId, drinkId: drink.id, deletedAt: null },
    data: { active: false },
  });
}
