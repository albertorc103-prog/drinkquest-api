-- FASE 3: metadata de submit + índice submitted_at
ALTER TABLE "bar_mission_medal_versions"
  ADD COLUMN IF NOT EXISTS "submitted_by_user_id" UUID;

CREATE INDEX IF NOT EXISTS "bar_mission_medal_versions_submitted_at_idx"
  ON "bar_mission_medal_versions" ("submitted_at");
