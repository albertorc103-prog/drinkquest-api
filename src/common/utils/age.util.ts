/**
 * Verificación de mayoría de edad (18+) sin persistir DOB.
 * Usa calendario America/Mexico_City (alineado a Quest Places) — no la zona del teléfono.
 */

export const AGE_OF_MAJORITY = 18;
export const AGE_CALENDAR_TIMEZONE = 'America/Mexico_City';

const BIRTH_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type AgeCheckOk = { ok: true; age: number };
export type AgeCheckFail = { ok: false; code: 'INVALID_FORMAT' | 'IMPOSSIBLE_DATE' | 'FUTURE' | 'TOO_OLD' | 'UNDERAGE' };
export type AgeCheckResult = AgeCheckOk | AgeCheckFail;

/** Fecha civil "hoy" en la zona fija de DrinkQuest. */
export function todayInAgeCalendar(now: Date = new Date()): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: AGE_CALENDAR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);
  return { y, m, d };
}

function isValidCivilDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Edad en años cumplidos comparando Y-M-D (mes y día). */
export function ageInYears(
  birth: { y: number; m: number; d: number },
  today: { y: number; m: number; d: number },
): number {
  let age = today.y - birth.y;
  if (today.m < birth.m || (today.m === birth.m && today.d < birth.d)) {
    age -= 1;
  }
  return age;
}

/**
 * Valida birthDate YYYY-MM-DD y comprueba ≥ 18 años.
 * No acepta isAdult booleano ni edad numérica del cliente.
 */
export function assertAdultBirthDate(
  birthDate: string | undefined | null,
  now: Date = new Date(),
): AgeCheckResult {
  if (typeof birthDate !== 'string' || !birthDate.trim()) {
    return { ok: false, code: 'INVALID_FORMAT' };
  }
  const match = BIRTH_DATE_RE.exec(birthDate.trim());
  if (!match) return { ok: false, code: 'INVALID_FORMAT' };
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!isValidCivilDate(y, m, d)) return { ok: false, code: 'IMPOSSIBLE_DATE' };

  const today = todayInAgeCalendar(now);
  // Futuro o mismo día de nacimiento imposible como adulto recién nacido.
  if (y > today.y || (y === today.y && (m > today.m || (m === today.m && d > today.d)))) {
    return { ok: false, code: 'FUTURE' };
  }
  // Límite razonable (~120 años) sin discriminar adultos legítimos.
  if (today.y - y > 120) return { ok: false, code: 'TOO_OLD' };

  const age = ageInYears({ y, m, d }, today);
  if (age < AGE_OF_MAJORITY) return { ok: false, code: 'UNDERAGE' };
  return { ok: true, age };
}

export function ageCheckErrorMessage(code: AgeCheckFail['code']): string {
  switch (code) {
    case 'UNDERAGE':
      return 'Debes tener al menos 18 años para crear una cuenta en DrinkQuest.';
    case 'FUTURE':
      return 'La fecha de nacimiento no puede ser futura.';
    case 'IMPOSSIBLE_DATE':
    case 'INVALID_FORMAT':
      return 'Fecha de nacimiento inválida. Usa el formato AAAA-MM-DD.';
    case 'TOO_OLD':
      return 'Fecha de nacimiento fuera de rango válido.';
    default:
      return 'No se pudo verificar la mayoría de edad.';
  }
}
