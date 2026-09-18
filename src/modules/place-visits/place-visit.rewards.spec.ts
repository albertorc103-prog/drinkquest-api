import { PlaceVisitRewardTier } from '@prisma/client';
import { PLACE_VISIT_CONFIG } from './place-visit.config';
import { levelFromTotalXp, xpForVisit } from './place-visit.rewards';

describe('place-visit.rewards', () => {
  it('XP SUBSCRIBED first/return', () => {
    expect(xpForVisit(PlaceVisitRewardTier.SUBSCRIBED, true)).toBe(
      PLACE_VISIT_CONFIG.SUBSCRIBED_FIRST_VISIT_XP,
    );
    expect(xpForVisit(PlaceVisitRewardTier.SUBSCRIBED, false)).toBe(
      PLACE_VISIT_CONFIG.SUBSCRIBED_RETURN_VISIT_XP,
    );
  });

  it('XP STANDARD first/return', () => {
    expect(xpForVisit(PlaceVisitRewardTier.STANDARD, true)).toBe(
      PLACE_VISIT_CONFIG.STANDARD_FIRST_VISIT_XP,
    );
    expect(xpForVisit(PlaceVisitRewardTier.STANDARD, false)).toBe(
      PLACE_VISIT_CONFIG.STANDARD_RETURN_VISIT_XP,
    );
  });

  it('valores exactos del producto', () => {
    expect(PLACE_VISIT_CONFIG.SUBSCRIBED_FIRST_VISIT_XP).toBe(25);
    expect(PLACE_VISIT_CONFIG.SUBSCRIBED_RETURN_VISIT_XP).toBe(5);
    expect(PLACE_VISIT_CONFIG.STANDARD_FIRST_VISIT_XP).toBe(10);
    expect(PLACE_VISIT_CONFIG.STANDARD_RETURN_VISIT_XP).toBe(2);
    expect(PLACE_VISIT_CONFIG.CHECK_IN_RADIUS_METERS).toBe(50);
    expect(PLACE_VISIT_CONFIG.MAX_CHECK_IN_ACCURACY_METERS).toBe(50);
    expect(PLACE_VISIT_CONFIG.MIN_CHECK_IN_INTERVAL_HOURS).toBe(4);
    expect(PLACE_VISIT_CONFIG.PLACES_COORDS_CACHE_MAX_DAYS).toBe(30);
  });

  it('levelFromTotalXp coherente', () => {
    expect(levelFromTotalXp(0)).toBe(1);
    expect(levelFromTotalXp(179)).toBe(1);
    expect(levelFromTotalXp(180)).toBe(2);
  });
});
