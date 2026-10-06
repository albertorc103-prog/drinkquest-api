/**
 * Proactive Discovery — configuración central (Fase 3.1 / 3.1B).
 * Independiente de CHECK_IN_RADIUS (50 m) en place-visit.config.
 */
export const PLACE_DISCOVERY_CONFIG = {
  /** Radio de búsqueda de candidatos alrededor del usuario (metros). */
  SEARCH_RADIUS_METERS: 3_000,
  /** Radio sugerido para geofence de lugar en Android (descubrimiento). */
  PLACE_GEOFENCE_RADIUS_METERS: 450,
  /** Radio sugerido para geofence de región (refresh del pool). */
  REGION_GEOFENCE_RADIUS_METERS: 2_500,
  /** Máximo de candidatos devueltos (margen bajo el límite Android ~100). */
  MAX_CANDIDATES: 80,
  /** Máximo de place_id semilla aceptados del cliente (solo IDs, no metadatos). */
  MAX_SEED_PLACE_IDS: 40,
  /** Máximo de resoluciones Place Details por request (semillas nuevas). */
  MAX_SEED_RESOLVE_CALLS: 15,
  /** Peso: establecimiento DrinkQuest con suscripción activa. */
  SCORE_PARTNER: 40,
  /** Peso por estrella DrinkQuest (0–5 → hasta 25). */
  SCORE_RATING_PER_STAR: 5,
  /** Peso por log10(reviewCount+1) * factor. */
  SCORE_REVIEW_LOG_FACTOR: 8,
  /** Bonus promo activa. */
  SCORE_ACTIVE_PROMO: 12,
  /** Penalización si visitó el lugar en las últimas 48 h. */
  SCORE_RECENT_VISIT_PENALTY: 30,
  /** Penalización suave si visitó alguna vez. */
  SCORE_ANY_VISIT_PENALTY: 8,
} as const;

export type PlaceDiscoveryConfig = typeof PLACE_DISCOVERY_CONFIG;
