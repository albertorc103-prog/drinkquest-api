-- FASE 4: máximo una versión ACTIVE por temporada (concurrencia admin).
-- Prisma no modela índices parciales; se aplica solo en PostgreSQL.

CREATE UNIQUE INDEX IF NOT EXISTS "bar_mission_medal_versions_one_active_per_season_idx"
  ON "bar_mission_medal_versions" ("season_id")
  WHERE "status" = 'ACTIVE'::"BarMissionMedalVersionStatus";
