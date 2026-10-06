import { PLACE_VISIT_CONFIG } from './place-visit.config';
import { validateCheckInLocationFix } from './place-visit.location';

describe('validateCheckInLocationFix', () => {
  const now = new Date('2026-10-05T18:00:00.000Z');
  const base = {
    latitude: 20.67,
    longitude: -101.35,
    accuracy: 12,
    capturedAtMs: now.getTime() - 10_000,
  };

  it('TEST 1: latitude > 90 → FAIL', () => {
    const r = validateCheckInLocationFix({ ...base, latitude: 91 }, now);
    expect(r.ok).toBe(false);
  });

  it('TEST 2: latitude < -90 → FAIL', () => {
    const r = validateCheckInLocationFix({ ...base, latitude: -91 }, now);
    expect(r.ok).toBe(false);
  });

  it('TEST 3: longitude > 180 → FAIL', () => {
    const r = validateCheckInLocationFix({ ...base, longitude: 181 }, now);
    expect(r.ok).toBe(false);
  });

  it('TEST 4: longitude < -180 → FAIL', () => {
    const r = validateCheckInLocationFix({ ...base, longitude: -181 }, now);
    expect(r.ok).toBe(false);
  });

  it('TEST 5: coordenadas válidas → PASS', () => {
    expect(validateCheckInLocationFix(base, now).ok).toBe(true);
  });

  it('TEST 10: precisión excesiva → FAIL', () => {
    const r = validateCheckInLocationFix(
      { ...base, accuracy: PLACE_VISIT_CONFIG.MAX_CHECK_IN_ACCURACY_METERS + 1 },
      now,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('LOCATION_TOO_INACCURATE');
  });

  it('NaN / Infinity → FAIL', () => {
    expect(validateCheckInLocationFix({ ...base, latitude: NaN }, now).ok).toBe(false);
    expect(validateCheckInLocationFix({ ...base, longitude: Infinity }, now).ok).toBe(false);
  });

  it('ubicación demasiado antigua → FAIL', () => {
    const r = validateCheckInLocationFix(
      {
        ...base,
        capturedAtMs: now.getTime() - PLACE_VISIT_CONFIG.MAX_LOCATION_AGE_MS - 1,
      },
      now,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('LOCATION_STALE');
  });
});
