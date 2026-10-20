/**
 * Coherencia temporada ↔ versión de medalla (preflight Render).
 * Debe mantenerse alineado con `tools/bar-medal-db-check.mjs`.
 */

export type PreflightFinding = {
  code: string;
  severity: 'blocker' | 'warn';
  message: string;
};

/**
 * Temporada sin filas en BarMissionMedalVersion es válida mientras el bar
 * aún no llama a createDraft (p. ej. temporada "Medalla Sheldz" en preparación).
 * Bloqueamos solo si hay unlocks de usuarios sin versión definida.
 */
export function buildSeasonVersionCoherenceFindings(
  inconsistentWithoutVersion: number,
  preparationWithoutVersion: number,
): PreflightFinding[] {
  const findings: PreflightFinding[] = [];
  if (inconsistentWithoutVersion > 0) {
    findings.push({
      code: 'SEASON_WITHOUT_VERSION',
      severity: 'blocker',
      message: `${inconsistentWithoutVersion} season(s) con UserBarMedal pero sin BarMissionMedalVersion`,
    });
  }
  if (preparationWithoutVersion > 0) {
    findings.push({
      code: 'SEASON_MEDAL_PREP',
      severity: 'warn',
      message: `${preparationWithoutVersion} season(s) en preparación (sin versión aún; flujo createSeason → createDraft)`,
    });
  }
  return findings;
}

/** SQL: seasons sin versión que sí comprometen integridad (unlock sin definición). */
export const SQL_INCONSISTENT_SEASON_WITHOUT_VERSION = `
  SELECT COUNT(*)::int AS qty
  FROM bar_mission_seasons s
  WHERE s.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM bar_mission_medal_versions v WHERE v.season_id = s.id
    )
    AND EXISTS (
      SELECT 1 FROM user_bar_medals u WHERE u.season_id = s.id
    )
`;

/** SQL: seasons legítimamente sin versión (sin unlocks; current_medal_version_id nulo). */
export const SQL_PREPARATION_SEASON_WITHOUT_VERSION = `
  SELECT COUNT(*)::int AS qty
  FROM bar_mission_seasons s
  WHERE s.deleted_at IS NULL
    AND s.current_medal_version_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM bar_mission_medal_versions v WHERE v.season_id = s.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_bar_medals u WHERE u.season_id = s.id
    )
`;
