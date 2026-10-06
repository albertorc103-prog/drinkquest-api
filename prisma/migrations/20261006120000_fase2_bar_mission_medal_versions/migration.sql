-- FASE 2 Medallas de Locales v2: versionado + condiciones + backfill legacy
-- Preserva BarMissionSeason.medal_title/description y UserBarMedal existentes.

-- Enums
CREATE TYPE "BarMissionMedalVersionStatus" AS ENUM (
  'DRAFT',
  'PENDING_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'ACTIVE',
  'REJECTED',
  'DISABLED'
);

CREATE TYPE "BarMissionMedalConditionMode" AS ENUM ('ALL', 'ANY');

CREATE TYPE "BarMissionMedalConditionType" AS ENUM (
  'VISITS',
  'DRINKS_UNLOCKED',
  'MISSION_COMPLETED',
  'EVENT_PARTICIPATION'
);

-- Versiones de medalla
CREATE TABLE "bar_mission_medal_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "season_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "BarMissionMedalVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "condition_mode" "BarMissionMedalConditionMode" NOT NULL DEFAULT 'ALL',
  "xp_reward" INTEGER NOT NULL DEFAULT 0,
  "template_id" TEXT,
  "design_config" JSONB,
  "review_note" TEXT,
  "moderated_by_admin_id" UUID,
  "moderated_at" TIMESTAMP(3),
  "submitted_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "disabled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bar_mission_medal_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bar_mission_medal_versions_season_id_version_key"
  ON "bar_mission_medal_versions" ("season_id", "version");
CREATE INDEX "bar_mission_medal_versions_season_id_idx"
  ON "bar_mission_medal_versions" ("season_id");
CREATE INDEX "bar_mission_medal_versions_status_idx"
  ON "bar_mission_medal_versions" ("status");

ALTER TABLE "bar_mission_medal_versions"
  ADD CONSTRAINT "bar_mission_medal_versions_season_id_fkey"
  FOREIGN KEY ("season_id") REFERENCES "bar_mission_seasons"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Condiciones
CREATE TABLE "bar_mission_medal_conditions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "medal_version_id" UUID NOT NULL,
  "type" "BarMissionMedalConditionType" NOT NULL,
  "target_value" INTEGER,
  "reference_id" UUID,
  "metadata" JSONB,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bar_mission_medal_conditions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bar_mission_medal_conditions_medal_version_id_idx"
  ON "bar_mission_medal_conditions" ("medal_version_id");
CREATE INDEX "bar_mission_medal_conditions_type_idx"
  ON "bar_mission_medal_conditions" ("type");
CREATE INDEX "bar_mission_medal_conditions_reference_id_idx"
  ON "bar_mission_medal_conditions" ("reference_id");

ALTER TABLE "bar_mission_medal_conditions"
  ADD CONSTRAINT "bar_mission_medal_conditions_medal_version_id_fkey"
  FOREIGN KEY ("medal_version_id") REFERENCES "bar_mission_medal_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bar_mission_medal_conditions"
  ADD CONSTRAINT "bar_mission_medal_conditions_reference_id_fkey"
  FOREIGN KEY ("reference_id") REFERENCES "bar_missions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- UserBarMedal → versión
ALTER TABLE "user_bar_medals"
  ADD COLUMN IF NOT EXISTS "medal_version_id" UUID;

CREATE INDEX IF NOT EXISTS "user_bar_medals_medal_version_id_idx"
  ON "user_bar_medals" ("medal_version_id");

-- Season → versión actual (FK se añade tras backfill)
ALTER TABLE "bar_mission_seasons"
  ADD COLUMN IF NOT EXISTS "current_medal_version_id" UUID;

CREATE INDEX IF NOT EXISTS "bar_mission_seasons_current_medal_version_id_idx"
  ON "bar_mission_seasons" ("current_medal_version_id");

-- ---------------------------------------------------------------------------
-- BACKFILL LEGACY
-- Cada temporada → 1 versión (v1) + condiciones MISSION_COMPLETED por misión.
-- UserBarMedal existentes → apuntan a esa versión. No crea nuevos unlocks.
-- ---------------------------------------------------------------------------

INSERT INTO "bar_mission_medal_versions" (
  "id",
  "season_id",
  "version",
  "title",
  "description",
  "status",
  "condition_mode",
  "xp_reward",
  "submitted_at",
  "approved_at",
  "activated_at",
  "disabled_at",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  s."id",
  1,
  s."medal_title",
  s."medal_description",
  CASE s."status"::text
    WHEN 'ACTIVE' THEN 'ACTIVE'::"BarMissionMedalVersionStatus"
    WHEN 'ENDED' THEN 'DISABLED'::"BarMissionMedalVersionStatus"
    ELSE 'DRAFT'::"BarMissionMedalVersionStatus"
  END,
  'ALL'::"BarMissionMedalConditionMode",
  0,
  CASE
    WHEN s."status"::text IN ('ACTIVE', 'ENDED') THEN s."created_at"
    ELSE NULL
  END,
  CASE
    WHEN s."status"::text IN ('ACTIVE', 'ENDED') THEN s."created_at"
    ELSE NULL
  END,
  CASE
    WHEN s."status"::text = 'ACTIVE' THEN COALESCE(s."updated_at", s."created_at")
    ELSE NULL
  END,
  CASE
    WHEN s."status"::text = 'ENDED' THEN COALESCE(s."updated_at", s."created_at")
    ELSE NULL
  END,
  s."created_at",
  s."updated_at"
FROM "bar_mission_seasons" s
WHERE NOT EXISTS (
  SELECT 1 FROM "bar_mission_medal_versions" v
  WHERE v."season_id" = s."id" AND v."version" = 1
);

INSERT INTO "bar_mission_medal_conditions" (
  "id",
  "medal_version_id",
  "type",
  "target_value",
  "reference_id",
  "metadata",
  "position",
  "created_at"
)
SELECT
  gen_random_uuid(),
  v."id",
  'MISSION_COMPLETED'::"BarMissionMedalConditionType",
  1,
  m."id",
  NULL,
  m."sort_order",
  m."created_at"
FROM "bar_missions" m
INNER JOIN "bar_mission_medal_versions" v
  ON v."season_id" = m."season_id" AND v."version" = 1
WHERE NOT EXISTS (
  SELECT 1 FROM "bar_mission_medal_conditions" c
  WHERE c."medal_version_id" = v."id"
    AND c."type" = 'MISSION_COMPLETED'
    AND c."reference_id" = m."id"
);

UPDATE "user_bar_medals" u
SET "medal_version_id" = v."id"
FROM "bar_mission_medal_versions" v
WHERE v."season_id" = u."season_id"
  AND v."version" = 1
  AND u."medal_version_id" IS NULL;

UPDATE "bar_mission_seasons" s
SET "current_medal_version_id" = v."id"
FROM "bar_mission_medal_versions" v
WHERE v."season_id" = s."id"
  AND v."version" = 1
  AND s."current_medal_version_id" IS NULL;

-- FK UserBarMedal → Version (Restrict: no borrar versión con unlocks)
ALTER TABLE "user_bar_medals"
  ADD CONSTRAINT "user_bar_medals_medal_version_id_fkey"
  FOREIGN KEY ("medal_version_id") REFERENCES "bar_mission_medal_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK Season.current → Version
ALTER TABLE "bar_mission_seasons"
  ADD CONSTRAINT "bar_mission_seasons_current_medal_version_id_fkey"
  FOREIGN KEY ("current_medal_version_id") REFERENCES "bar_mission_medal_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
