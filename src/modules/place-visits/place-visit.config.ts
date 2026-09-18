/**
 * Quest Places — constantes de XP / check-in (única fuente de verdad).
 *
 * Caché Places (referencia oficial, no reinterpretar en otros archivos):
 * - place_id: se puede almacenar indefinidamente
 *   https://developers.google.com/maps/documentation/places/web-service/policies
 * - lat/lng Places API: máx. 30 días calendario consecutivos, luego borrar
 *   Google Maps Platform Service Specific Terms §14.3
 *   https://cloud.google.com/maps-platform/terms/maps-service-terms
 * No persistir fotos, ratings ni reviews para check-in.
 */
export const PLACE_VISIT_CONFIG = {
  CHECK_IN_RADIUS_METERS: 50,
  MAX_CHECK_IN_ACCURACY_METERS: 50,
  MIN_CHECK_IN_INTERVAL_HOURS: 4,
  SUBSCRIBED_FIRST_VISIT_XP: 25,
  SUBSCRIBED_RETURN_VISIT_XP: 5,
  STANDARD_FIRST_VISIT_XP: 10,
  STANDARD_RETURN_VISIT_XP: 2,
  /** Zona para visitDate (1 visita válida / día calendario). */
  VISIT_CALENDAR_TIMEZONE: 'America/Mexico_City',
  /**
   * TTL de lat/lng (y metadata mínima de display) en ExternalPlace.
   * Alineado a SST §14.3 Places API (30 días).
   */
  PLACES_COORDS_CACHE_MAX_DAYS: 30,
} as const;

export type PlaceVisitConfig = typeof PLACE_VISIT_CONFIG;
