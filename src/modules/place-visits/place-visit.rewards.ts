import { PlaceVisitRewardTier } from '@prisma/client';
import { PLACE_VISIT_CONFIG } from './place-visit.config';

export function xpForVisit(
  tier: PlaceVisitRewardTier,
  firstVisit: boolean,
): number {
  if (tier === PlaceVisitRewardTier.SUBSCRIBED) {
    return firstVisit
      ? PLACE_VISIT_CONFIG.SUBSCRIBED_FIRST_VISIT_XP
      : PLACE_VISIT_CONFIG.SUBSCRIBED_RETURN_VISIT_XP;
  }
  return firstVisit
    ? PLACE_VISIT_CONFIG.STANDARD_FIRST_VISIT_XP
    : PLACE_VISIT_CONFIG.STANDARD_RETURN_VISIT_XP;
}

/** Mismo algoritmo que UsersService.levelFromTotalXp. */
export function levelFromTotalXp(totalXp: number): number {
  let remaining = Math.max(0, totalXp);
  let level = 1;
  while (level < 50) {
    const need = 180 + (level - 1) * 40;
    if (remaining < need) return level;
    remaining -= need;
    level += 1;
  }
  return 50;
}
