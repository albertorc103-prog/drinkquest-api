import { calendarDateInTimeZone, haversineMeters } from './place-visit.geo';
import { PLACE_VISIT_CONFIG } from './place-visit.config';

describe('place-visit.geo', () => {
  it('haversine ~0 para mismo punto', () => {
    expect(haversineMeters(20.67, -101.35, 20.67, -101.35)).toBeLessThan(0.1);
  });

  it('haversine detecta fuera de 50 m', () => {
    // ~111 m por 0.001° lat
    const d = haversineMeters(20.67, -101.35, 20.671, -101.35);
    expect(d).toBeGreaterThan(PLACE_VISIT_CONFIG.CHECK_IN_RADIUS_METERS);
  });

  it('calendarDateInTimeZone America/Mexico_City', () => {
    // 2026-09-19 02:00 UTC = 2026-09-18 20:00 en CDMX (UTC-6)
    const now = new Date('2026-09-19T02:00:00.000Z');
    const d = calendarDateInTimeZone(
      now,
      PLACE_VISIT_CONFIG.VISIT_CALENDAR_TIMEZONE,
    );
    expect(d.toISOString().slice(0, 10)).toBe('2026-09-18');
  });
});
