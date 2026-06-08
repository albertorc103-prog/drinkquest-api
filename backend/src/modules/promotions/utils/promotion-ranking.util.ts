import { PromotionPlacementType } from '@prisma/client';

/** Score base para orden del feed (featured / boosted / priority). Stripe boosts en fases futuras. */
export function computePromotionRankingScore(
  priority: number,
  placementType: PromotionPlacementType,
): number {
  const placementBoost =
    placementType === PromotionPlacementType.BOOSTED
      ? 200
      : placementType === PromotionPlacementType.FEATURED
        ? 100
        : 0;
  return priority + placementBoost;
}
