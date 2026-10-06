import { PLACE_VISIT_CONFIG } from './place-visit.config';

export type LocationFixFailCode =
  | 'LOCATION_INVALID'
  | 'LOCATION_TOO_INACCURATE'
  | 'LOCATION_STALE'
  | 'LOCATION_FUTURE';

export type LocationFixOk = { ok: true };
export type LocationFixFail = { ok: false; code: LocationFixFailCode; message: string };
export type LocationFixResult = LocationFixOk | LocationFixFail;

/**
 * Valida el fix GPS del usuario para check-in.
 * No confía en distance/xp/eligible del cliente (esos campos no se leen).
 */
export function validateCheckInLocationFix(
  input: {
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAtMs?: number | null;
  },
  now: Date = new Date(),
): LocationFixResult {
  const { latitude, longitude, accuracy, capturedAtMs } = input;

  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    typeof accuracy !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(accuracy)
  ) {
    return {
      ok: false,
      code: 'LOCATION_INVALID',
      message: 'Coordenadas de ubicación inválidas.',
    };
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return {
      ok: false,
      code: 'LOCATION_INVALID',
      message: 'Coordenadas de ubicación fuera de rango.',
    };
  }
  if (accuracy < 0) {
    return {
      ok: false,
      code: 'LOCATION_INVALID',
      message: 'Precisión de ubicación inválida.',
    };
  }
  if (accuracy > PLACE_VISIT_CONFIG.MAX_CHECK_IN_ACCURACY_METERS) {
    return {
      ok: false,
      code: 'LOCATION_TOO_INACCURATE',
      message:
        'No pudimos confirmar tu ubicación con suficiente precisión. Intenta nuevamente en un lugar con mejor señal.',
    };
  }

  if (capturedAtMs != null) {
    if (!Number.isFinite(capturedAtMs) || capturedAtMs <= 0) {
      return {
        ok: false,
        code: 'LOCATION_INVALID',
        message: 'Marca de tiempo de ubicación inválida.',
      };
    }
    const skew = capturedAtMs - now.getTime();
    // Margen pequeño por desfase de reloj del teléfono.
    if (skew > 2 * 60 * 1000) {
      return {
        ok: false,
        code: 'LOCATION_FUTURE',
        message: 'La ubicación reportada parece inconsistente. Intenta de nuevo.',
      };
    }
    const age = now.getTime() - capturedAtMs;
    if (age > PLACE_VISIT_CONFIG.MAX_LOCATION_AGE_MS) {
      return {
        ok: false,
        code: 'LOCATION_STALE',
        message:
          'Tu ubicación es demasiado antigua. Activa el GPS e intenta registrar la visita de nuevo.',
      };
    }
  }

  return { ok: true };
}
