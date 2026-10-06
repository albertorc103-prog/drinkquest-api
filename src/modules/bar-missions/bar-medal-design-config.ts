import { BadRequestException } from '@nestjs/common';

/** Identificador de plantilla visual V1 (columna templateId). */
export const BAR_MEDAL_TEMPLATE_V1 = 'bar-medal-visual-v1';

export const BAR_MEDAL_SHAPES = ['CIRCLE', 'HEXAGON', 'SHIELD', 'OCTAGON'] as const;
export const BAR_MEDAL_STYLES = ['ELEGANT', 'MYSTIC', 'URBAN', 'NIGHT'] as const;
export const BAR_MEDAL_MATERIALS = ['GOLD', 'SILVER', 'TITANIUM', 'OBSIDIAN'] as const;
export const BAR_MEDAL_PALETTES = [
  'AMBER',
  'EMERALD',
  'ELECTRIC_BLUE',
  'VIOLET',
  'WINE_RED',
  'TURQUOISE',
  'NIGHT_MAGENTA',
  'ICE_WHITE',
] as const;
export const BAR_MEDAL_IDENTITY_MODES = ['LOGO', 'MONOGRAM', 'DRINKQUEST_EMBLEM'] as const;
export const BAR_MEDAL_IDENTITY_PLACEMENTS = ['PRIMARY', 'SECONDARY_SEAL'] as const;
export const BAR_MEDAL_EMBLEMS = [
  'COCKTAIL_GLASS',
  'SHAKER',
  'AGAVE',
  'CROWN',
  'SNAKE',
  'FIRE',
  'MOON',
  'SKYLINE',
  'DISCO_BALL',
  'COMPASS',
] as const;
export const BAR_MEDAL_ORNAMENTS = [
  'STARS',
  'LIGHTNING',
  'LEAVES',
  'FLAMES',
  'CONSTELLATION',
  'MUSIC',
  'BUBBLES',
  'ALCHEMY',
  'ART_DECO',
  'SPARKS',
] as const;

export type BarMedalShape = (typeof BAR_MEDAL_SHAPES)[number];
export type BarMedalStyle = (typeof BAR_MEDAL_STYLES)[number];
export type BarMedalMaterial = (typeof BAR_MEDAL_MATERIALS)[number];
export type BarMedalPalette = (typeof BAR_MEDAL_PALETTES)[number];
export type BarMedalIdentityMode = (typeof BAR_MEDAL_IDENTITY_MODES)[number];
export type BarMedalIdentityPlacement = (typeof BAR_MEDAL_IDENTITY_PLACEMENTS)[number];
export type BarMedalEmblem = (typeof BAR_MEDAL_EMBLEMS)[number];
export type BarMedalOrnament = (typeof BAR_MEDAL_ORNAMENTS)[number];

export type BarMedalDesignConfigV1 = {
  schemaVersion: 1;
  shape: BarMedalShape;
  style: BarMedalStyle;
  material: BarMedalMaterial;
  palette: BarMedalPalette;
  identityMode: BarMedalIdentityMode;
  identityPlacement: BarMedalIdentityPlacement;
  /** UploadAsset.id del logo/isotipo (opcional si solo hay URL snapshot). */
  identityAssetId: string | null;
  /**
   * URL pública inmutable del asset usado en esta versión.
   * Snapshot: no se vuelve a leer Bar.logoUrl en runtime histórico.
   */
  identityAssetUrl: string | null;
  emblem: BarMedalEmblem | null;
  ornaments: BarMedalOrnament[];
  monogram: string | null;
};

export const LEGACY_BAR_MEDAL_DESIGN: BarMedalDesignConfigV1 = {
  schemaVersion: 1,
  shape: 'CIRCLE',
  style: 'ELEGANT',
  material: 'GOLD',
  palette: 'AMBER',
  identityMode: 'DRINKQUEST_EMBLEM',
  identityPlacement: 'PRIMARY',
  identityAssetId: null,
  identityAssetUrl: null,
  emblem: 'COCKTAIL_GLASS',
  ornaments: ['STARS'],
  monogram: null,
};

const MAX_ORNAMENTS = 2;
const MONOGRAM_MAX = 3;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new BadRequestException(`INVALID_DESIGN_${field.toUpperCase()}`);
  }
  return value as T;
}

/** Normaliza monograma: trim + uppercase, 1–3 chars. */
export function normalizeMonogram(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new BadRequestException('INVALID_DESIGN_MONOGRAM');
  }
  const m = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (m.length < 1 || m.length > MONOGRAM_MAX) {
    throw new BadRequestException('INVALID_DESIGN_MONOGRAM');
  }
  // Solo letras/números para presentación limpia.
  if (!/^[A-Z0-9]{1,3}$/.test(m)) {
    throw new BadRequestException('INVALID_DESIGN_MONOGRAM');
  }
  return m;
}

/**
 * Valida y normaliza designConfig schema v1.
 * No resuelve ownership de assets (eso lo hace el servicio con Prisma).
 */
export function validateDesignConfigInput(
  raw: unknown,
  opts?: { requireIdentityResolved?: boolean },
): BarMedalDesignConfigV1 {
  if (!isPlainObject(raw)) {
    throw new BadRequestException('INVALID_DESIGN_CONFIG');
  }
  const schemaVersion = raw.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== '1') {
    throw new BadRequestException('UNSUPPORTED_DESIGN_SCHEMA');
  }

  const shape = assertOneOf(raw.shape, BAR_MEDAL_SHAPES, 'shape');
  const style = assertOneOf(raw.style, BAR_MEDAL_STYLES, 'style');
  const material = assertOneOf(raw.material, BAR_MEDAL_MATERIALS, 'material');
  const palette = assertOneOf(raw.palette, BAR_MEDAL_PALETTES, 'palette');
  const identityMode = assertOneOf(raw.identityMode, BAR_MEDAL_IDENTITY_MODES, 'identity_mode');
  const identityPlacement = assertOneOf(
    raw.identityPlacement ?? 'PRIMARY',
    BAR_MEDAL_IDENTITY_PLACEMENTS,
    'identity_placement',
  );

  let ornaments: BarMedalOrnament[] = [];
  if (raw.ornaments !== undefined && raw.ornaments !== null) {
    if (!Array.isArray(raw.ornaments)) {
      throw new BadRequestException('INVALID_DESIGN_ORNAMENTS');
    }
    if (raw.ornaments.length > MAX_ORNAMENTS) {
      throw new BadRequestException('TOO_MANY_ORNAMENTS');
    }
    const seen = new Set<string>();
    for (const o of raw.ornaments) {
      const ornament = assertOneOf(o, BAR_MEDAL_ORNAMENTS, 'ornament');
      if (seen.has(ornament)) {
        throw new BadRequestException('DUPLICATE_ORNAMENT');
      }
      seen.add(ornament);
      ornaments.push(ornament);
    }
  }

  let emblem: BarMedalEmblem | null = null;
  if (raw.emblem !== undefined && raw.emblem !== null && raw.emblem !== '') {
    emblem = assertOneOf(raw.emblem, BAR_MEDAL_EMBLEMS, 'emblem');
  }

  let monogram: string | null = null;
  if (raw.monogram !== undefined && raw.monogram !== null && String(raw.monogram).trim() !== '') {
    monogram = normalizeMonogram(raw.monogram);
  }

  let identityAssetId: string | null = null;
  if (
    raw.identityAssetId !== undefined &&
    raw.identityAssetId !== null &&
    String(raw.identityAssetId).trim() !== ''
  ) {
    const id = String(raw.identityAssetId).trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new BadRequestException('INVALID_DESIGN_IDENTITY_ASSET');
    }
    identityAssetId = id;
  }

  let identityAssetUrl: string | null = null;
  if (
    raw.identityAssetUrl !== undefined &&
    raw.identityAssetUrl !== null &&
    String(raw.identityAssetUrl).trim() !== ''
  ) {
    const url = String(raw.identityAssetUrl).trim();
    if (!/^https?:\/\//i.test(url) || url.length > 2048) {
      throw new BadRequestException('INVALID_DESIGN_IDENTITY_URL');
    }
    identityAssetUrl = url;
  }

  if (identityMode === 'MONOGRAM') {
    if (!monogram) {
      throw new BadRequestException('MONOGRAM_REQUIRED');
    }
  }
  if (identityMode === 'DRINKQUEST_EMBLEM') {
    if (!emblem) {
      throw new BadRequestException('EMBLEM_REQUIRED');
    }
  }
  if (identityMode === 'LOGO') {
    // ownership/resuelto en servicio; aquí solo estructura
    if (opts?.requireIdentityResolved && !identityAssetUrl && !identityAssetId) {
      throw new BadRequestException('LOGO_IDENTITY_REQUIRED');
    }
  }

  // SECONDARY_SEAL implica un emblema temático central.
  if (identityPlacement === 'SECONDARY_SEAL' && !emblem) {
    throw new BadRequestException('EMBLEM_REQUIRED_FOR_SECONDARY_SEAL');
  }

  return {
    schemaVersion: 1,
    shape,
    style,
    material,
    palette,
    identityMode,
    identityPlacement,
    identityAssetId,
    identityAssetUrl,
    emblem,
    ornaments,
    monogram: identityMode === 'MONOGRAM' ? monogram : monogram,
  };
}

/** Parseo seguro para lectura: nunca lanza; aplica fallback legacy. */
export function resolveDesignConfigForClient(raw: unknown): {
  designConfig: BarMedalDesignConfigV1;
  designConfigValid: boolean;
  isLegacyFallback: boolean;
} {
  if (raw == null) {
    return {
      designConfig: { ...LEGACY_BAR_MEDAL_DESIGN },
      designConfigValid: false,
      isLegacyFallback: true,
    };
  }
  try {
    const designConfig = validateDesignConfigInput(raw);
    return { designConfig, designConfigValid: true, isLegacyFallback: false };
  } catch {
    return {
      designConfig: { ...LEGACY_BAR_MEDAL_DESIGN },
      designConfigValid: false,
      isLegacyFallback: true,
    };
  }
}

/** Payload público para renderer (sin campos internos sensibles). */
export function toPublicDesignConfig(cfg: BarMedalDesignConfigV1) {
  return {
    schemaVersion: cfg.schemaVersion,
    shape: cfg.shape,
    style: cfg.style,
    material: cfg.material,
    palette: cfg.palette,
    identityMode: cfg.identityMode,
    identityPlacement: cfg.identityPlacement,
    identityAssetUrl: cfg.identityAssetUrl,
    emblem: cfg.emblem,
    ornaments: cfg.ornaments,
    monogram: cfg.monogram,
  };
}

export function buildTemplateId(cfg: BarMedalDesignConfigV1): string {
  return `${BAR_MEDAL_TEMPLATE_V1}:${cfg.shape}:${cfg.style}:${cfg.material}:${cfg.palette}`;
}
