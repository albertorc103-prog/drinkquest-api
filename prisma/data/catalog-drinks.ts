import { DrinkRarity } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type DemoDrinkSeed = {
  legacyId: number;
  slug: string;
  name: string;
  categorySlug: string;
  rarity: DrinkRarity;
  description: string;
  ingredients: string;
  imageUrl: string;
  imageKey: string;
  xpReward: number;
  baseAlcohol?: string;
  containsMezcal?: boolean;
  isPalomaFamily?: boolean;
};

/** Catálogo oficial Vesper: 100 cartas en drawable-nodpi (IDs 1–100). */
export const CANONICAL_CATALOG_SIZE = 100;

export const CATEGORIES = [
  { slug: 'cocktails', name: 'Cocktails', sortOrder: 1 },
  { slug: 'beer', name: 'Beer', sortOrder: 2 },
  { slug: 'wine', name: 'Wine', sortOrder: 3 },
  { slug: 'whiskey', name: 'Whiskey', sortOrder: 4 },
  { slug: 'tequila', name: 'Tequila', sortOrder: 5 },
  { slug: 'vodka', name: 'Vodka', sortOrder: 6 },
  { slug: 'gin', name: 'Gin', sortOrder: 7 },
  { slug: 'rum', name: 'Rum', sortOrder: 8 },
  { slug: 'mezcal', name: 'Mezcal', sortOrder: 9 },
  { slug: 'non-alcoholic', name: 'Non Alcoholic', sortOrder: 10 },
] as const;

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['\u2019\u2018\u02BC\u02BB]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Igual que normalizeDrinkImageName en Android (drawable-nodpi). */
export function imageKeyFromName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['\u2019\u2018\u02BC\u02BB]/g, '_')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return `drink_${slug}`;
}

function xpFor(rarity: DrinkRarity): number {
  switch (rarity) {
    case DrinkRarity.LEGENDARY:
      return 100;
    case DrinkRarity.EPIC:
      return 50;
    case DrinkRarity.RARE:
      return 25;
    default:
      return 10;
  }
}

type CanonicalRow = {
  legacyId: number;
  name: string;
  categorySlug: string;
  rarity: keyof typeof DrinkRarity;
};

function toDemoDrink(row: CanonicalRow): DemoDrinkSeed {
  const rarity = DrinkRarity[row.rarity];
  return {
    legacyId: row.legacyId,
    slug: slugify(row.name),
    name: row.name,
    categorySlug: row.categorySlug,
    rarity,
    description: `${row.name} — catálogo oficial Vesper.`,
    ingredients: 'Ver receta en la app Vesper.',
    imageUrl: '',
    imageKey: imageKeyFromName(row.name),
    xpReward: xpFor(rarity),
    containsMezcal: row.name.toLowerCase().includes('mezcal'),
    isPalomaFamily: row.name === 'Paloma',
  };
}

/**
 * Resuelve `canonical-catalog.json` probando varias rutas: junto al módulo (ts-node),
 * y relativo a la raíz del proyecto (build compilado en `dist-seed`, donde el JSON no se copia).
 */
function readCanonicalCatalog(): CanonicalRow[] {
  const candidates = [
    join(__dirname, 'canonical-catalog.json'),
    join(process.cwd(), 'prisma', 'data', 'canonical-catalog.json'),
    join(process.cwd(), 'dist-seed', 'prisma', 'data', 'canonical-catalog.json'),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      `No se encontró canonical-catalog.json. Rutas probadas: ${candidates.join(', ')}`,
    );
  }
  return JSON.parse(readFileSync(found, 'utf8')) as CanonicalRow[];
}

export const DEMO_DRINKS: DemoDrinkSeed[] = readCanonicalCatalog().map(toDemoDrink);

if (DEMO_DRINKS.length !== CANONICAL_CATALOG_SIZE) {
  throw new Error(`canonical-catalog.json debe tener ${CANONICAL_CATALOG_SIZE} bebidas`);
}

/** @deprecated Use DEMO_DRINKS */
export const CATALOG_DRINKS = DEMO_DRINKS;

export const CANONICAL_LEGACY_IDS = DEMO_DRINKS.map((d) => d.legacyId);

export function isCanonicalLegacyId(legacyId: number | null | undefined): boolean {
  return legacyId != null && legacyId >= 1 && legacyId <= CANONICAL_CATALOG_SIZE;
}
