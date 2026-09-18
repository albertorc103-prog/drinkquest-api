import { PLACE_VISIT_CONFIG } from './place-visit.config';
import { ExternalPlaceService } from './external-place.service';

describe('ExternalPlaceService.hasUsableCoords', () => {
  const service = new ExternalPlaceService({} as any, {} as any);
  const base = {
    id: '1',
    googlePlaceId: 'ABC',
    name: 'X',
    primaryType: 'bar',
    city: 'León',
    placeIdRefreshedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('acepta coords dentro de 30 días', () => {
    const now = new Date('2026-09-20T12:00:00.000Z');
    const ok = service.hasUsableCoords(
      {
        ...base,
        latitude: 20.1,
        longitude: -101.1,
        contentCachedAt: new Date('2026-09-01T12:00:00.000Z'),
      },
      now,
    );
    expect(ok).toBe(true);
  });

  it('rechaza coords > 30 días', () => {
    const now = new Date('2026-09-20T12:00:00.000Z');
    const days = PLACE_VISIT_CONFIG.PLACES_COORDS_CACHE_MAX_DAYS + 1;
    const cached = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const ok = service.hasUsableCoords(
      {
        ...base,
        latitude: 20.1,
        longitude: -101.1,
        contentCachedAt: cached,
      },
      now,
    );
    expect(ok).toBe(false);
  });

  it('rechaza sin lat/lng', () => {
    expect(
      service.hasUsableCoords({
        ...base,
        latitude: null,
        longitude: null,
        contentCachedAt: new Date(),
      }),
    ).toBe(false);
  });
});
