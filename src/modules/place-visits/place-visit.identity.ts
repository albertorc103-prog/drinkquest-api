/**
 * Identidad canónica de un lugar para firstVisit / unicidad diaria.
 * googlePlaceId cuando existe; barId solo si no hay googlePlaceId.
 */
export type PlaceIdentity =
  | { kind: 'google'; googlePlaceId: string }
  | { kind: 'bar'; barId: string };

export function resolvePlaceIdentity(input: {
  googlePlaceId?: string | null;
  barId?: string | null;
}): PlaceIdentity | null {
  const g = input.googlePlaceId?.trim();
  if (g) return { kind: 'google', googlePlaceId: g };
  const b = input.barId?.trim();
  if (b) return { kind: 'bar', barId: b };
  return null;
}

/** Clave estable para agrupar Mis lugares. */
export function collectionKey(input: {
  googlePlaceId?: string | null;
  barId?: string | null;
}): string | null {
  const identity = resolvePlaceIdentity(input);
  if (!identity) return null;
  return identity.kind === 'google'
    ? `g:${identity.googlePlaceId}`
    : `b:${identity.barId}`;
}
