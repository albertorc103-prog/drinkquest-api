-- Visual mode temporal: artwork administrativo vs builder V1
CREATE TYPE "BarMedalVisualMode" AS ENUM ('ADMIN_ARTWORK', 'BUILDER_V1');

ALTER TABLE "bar_mission_medal_versions"
  ADD COLUMN "visual_mode" "BarMedalVisualMode" NOT NULL DEFAULT 'ADMIN_ARTWORK',
  ADD COLUMN "artwork_asset_id" UUID,
  ADD COLUMN "artwork_url" TEXT;

-- Conservar medallas ya diseñadas con designConfig como BUILDER_V1
UPDATE "bar_mission_medal_versions"
SET "visual_mode" = 'BUILDER_V1'
WHERE "design_config" IS NOT NULL;
