import {
  buildSeasonVersionCoherenceFindings,
  SQL_INCONSISTENT_SEASON_WITHOUT_VERSION,
  SQL_PREPARATION_SEASON_WITHOUT_VERSION,
} from './bar-medal-preflight-season.util';

describe('bar-medal preflight season ↔ version', () => {
  it('preparación sin versión no genera blocker', () => {
    const findings = buildSeasonVersionCoherenceFindings(0, 1);
    expect(findings).toEqual([
      {
        code: 'SEASON_MEDAL_PREP',
        severity: 'warn',
        message:
          '1 season(s) en preparación (sin versión aún; flujo createSeason → createDraft)',
      },
    ]);
  });

  it('unlock sin versión genera SEASON_WITHOUT_VERSION blocker', () => {
    const findings = buildSeasonVersionCoherenceFindings(1, 0);
    expect(findings[0]).toMatchObject({
      code: 'SEASON_WITHOUT_VERSION',
      severity: 'blocker',
    });
  });

  it('sin hallazgos cuando todo coherente', () => {
    expect(buildSeasonVersionCoherenceFindings(0, 0)).toEqual([]);
  });

  it('SQL de preflight distingue preparación vs inconsistencia', () => {
    expect(SQL_INCONSISTENT_SEASON_WITHOUT_VERSION).toContain('user_bar_medals');
    expect(SQL_PREPARATION_SEASON_WITHOUT_VERSION).toContain(
      'current_medal_version_id IS NULL',
    );
    expect(SQL_PREPARATION_SEASON_WITHOUT_VERSION).toMatch(
      /NOT EXISTS\s*\(\s*SELECT 1 FROM user_bar_medals/,
    );
  });
});
