import { PromotionEventTheme, PromotionPlacementType } from '@prisma/client';

const THEME_LABELS: Record<PromotionEventTheme, string> = {
  [PromotionEventTheme.STANDARD]: 'Promoción',
  [PromotionEventTheme.CHRISTMAS]: 'Navidad',
  [PromotionEventTheme.NEW_YEAR]: 'Año Nuevo',
  [PromotionEventTheme.HALLOWEEN]: 'Halloween',
  [PromotionEventTheme.NOCHE_MEXICANA]: 'Noche mexicana',
  [PromotionEventTheme.ANNIVERSARY]: 'Aniversario',
};

export function promotionEventThemeLabel(theme: PromotionEventTheme): string {
  return THEME_LABELS[theme] ?? 'Promoción';
}

export function isThematicEventTheme(theme: PromotionEventTheme): boolean {
  return theme !== PromotionEventTheme.STANDARD;
}

/** Score base para orden del feed (featured / boosted / priority / temática Legend). */
export function computePromotionRankingScore(
  priority: number,
  placementType: PromotionPlacementType,
  eventTheme: PromotionEventTheme = PromotionEventTheme.STANDARD,
): number {
  const placementBoost =
    placementType === PromotionPlacementType.BOOSTED
      ? 200
      : placementType === PromotionPlacementType.FEATURED
        ? 100
        : 0;
  const themeBoost = isThematicEventTheme(eventTheme) ? 75 : 0;
  return priority + placementBoost + themeBoost;
}
