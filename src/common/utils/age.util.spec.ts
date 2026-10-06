import { assertAdultBirthDate, ageInYears, todayInAgeCalendar } from './age.util';

describe('age.util', () => {
  // Fijar "hoy" en México: 2026-10-05 → usar Date UTC que mapee a ese día en CDMX.
  // 2026-10-05 18:00 UTC = mediodía CDMX aprox.
  const now = new Date('2026-10-05T18:00:00.000Z');

  it('TEST 1: exactamente 18 años hoy → PASS', () => {
    const r = assertAdultBirthDate('2008-10-05', now);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.age).toBe(18);
  });

  it('TEST 2: cumple 18 mañana → FAIL', () => {
    const r = assertAdultBirthDate('2008-10-06', now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('UNDERAGE');
  });

  it('TEST 3: mayor de 18 → PASS', () => {
    const r = assertAdultBirthDate('1990-01-15', now);
    expect(r.ok).toBe(true);
  });

  it('TEST 4: menor de 18 → FAIL', () => {
    const r = assertAdultBirthDate('2015-05-01', now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('UNDERAGE');
  });

  it('TEST 5: fecha futura → FAIL', () => {
    const r = assertAdultBirthDate('2030-01-01', now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FUTURE');
  });

  it('TEST 6: formato inválido → FAIL', () => {
    expect(assertAdultBirthDate('05/10/2000', now).ok).toBe(false);
    expect(assertAdultBirthDate('2000-13-01', now).ok).toBe(false);
    expect(assertAdultBirthDate('', now).ok).toBe(false);
    expect(assertAdultBirthDate(null, now).ok).toBe(false);
  });

  it('TEST 7: 29 febrero año bisiesto', () => {
    // 2008-02-29 es válido; en 2026-10-05 tiene 18 años.
    const leap = assertAdultBirthDate('2008-02-29', now);
    expect(leap.ok).toBe(true);
    // 2007-02-29 no existe
    const bad = assertAdultBirthDate('2007-02-29', now);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('IMPOSSIBLE_DATE');
  });

  it('cumpleaños aún no llegado en el año resta un año', () => {
    const today = todayInAgeCalendar(now);
    expect(ageInYears({ y: 2008, m: 10, d: 6 }, today)).toBe(17);
    expect(ageInYears({ y: 2008, m: 10, d: 5 }, today)).toBe(18);
  });
});
