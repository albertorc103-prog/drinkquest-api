import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

type CanonicalRow = { legacyId: number; name: string };

const CANONICAL_SIZE = 100;

function loadCanonicalRows(): CanonicalRow[] {
  const candidates = [
    join(process.cwd(), 'prisma', 'data', 'canonical-catalog.json'),
    join(__dirname, '..', '..', '..', 'prisma', 'data', 'canonical-catalog.json'),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      `No se encontró canonical-catalog.json. Rutas: ${candidates.join(', ')}`,
    );
  }
  return JSON.parse(readFileSync(found, 'utf8')) as CanonicalRow[];
}

const ROWS = loadCanonicalRows();
const NAMES = new Set(ROWS.map((r) => r.name.trim().toLowerCase()));

export function isCanonicalLegacyId(legacyId: number | null | undefined): boolean {
  return legacyId != null && legacyId >= 1 && legacyId <= CANONICAL_SIZE;
}

/** Solo bebidas del set oficial 1–100 con nombre alineado (excluye set antiguo). */
export function isOfficialCatalogDrink(drink: {
  legacyId?: number | null;
  name?: string | null;
  sourceSpecialDrinkId?: string | null;
  deletedAt?: Date | string | null;
}): boolean {
  if (drink.deletedAt) return false;
  if (drink.sourceSpecialDrinkId) return false;
  if (!isCanonicalLegacyId(drink.legacyId ?? null)) return false;
  const name = drink.name?.trim().toLowerCase() ?? '';
  return name.length > 0 && NAMES.has(name);
}
