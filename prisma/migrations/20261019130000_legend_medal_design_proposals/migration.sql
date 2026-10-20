-- Legend medal design proposals: batch (5 slots) + bar selection on medal version.
-- Compatible con filas existentes (defaults / NULL).

CREATE TYPE "BarMedalDesignProposalBatchStatus" AS ENUM (
  'DRAFT',
  'SENT',
  'SUPERSEDED',
  'CANCELLED'
);

CREATE TABLE "bar_medal_design_proposal_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "medal_version_id" UUID NOT NULL,
  "status" "BarMedalDesignProposalBatchStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_admin_id" UUID NOT NULL,
  "sent_by_admin_id" UUID,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bar_medal_design_proposal_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bar_medal_design_proposals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "batch_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "artwork_asset_id" UUID NOT NULL,
  "image_url" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bar_medal_design_proposals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bar_mission_medal_versions"
  ADD COLUMN "uses_design_proposal_flow" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selected_proposal_id" UUID,
  ADD COLUMN "design_selection_confirmed_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "bar_mission_medal_versions_selected_proposal_id_key"
  ON "bar_mission_medal_versions" ("selected_proposal_id");

CREATE UNIQUE INDEX "bar_medal_design_proposals_batch_id_position_key"
  ON "bar_medal_design_proposals" ("batch_id", "position");

CREATE INDEX "bar_medal_design_proposal_batches_medal_version_id_idx"
  ON "bar_medal_design_proposal_batches" ("medal_version_id");

CREATE INDEX "bar_medal_design_proposal_batches_medal_version_id_status_idx"
  ON "bar_medal_design_proposal_batches" ("medal_version_id", "status");

CREATE INDEX "bar_medal_design_proposals_batch_id_idx"
  ON "bar_medal_design_proposals" ("batch_id");

-- Una sola ronda abierta (borrador o enviada) por versión.
CREATE UNIQUE INDEX "bar_medal_design_proposal_batches_one_open_per_version_idx"
  ON "bar_medal_design_proposal_batches" ("medal_version_id")
  WHERE "status" IN ('DRAFT'::"BarMedalDesignProposalBatchStatus", 'SENT'::"BarMedalDesignProposalBatchStatus");

ALTER TABLE "bar_medal_design_proposal_batches"
  ADD CONSTRAINT "bar_medal_design_proposal_batches_medal_version_id_fkey"
  FOREIGN KEY ("medal_version_id") REFERENCES "bar_mission_medal_versions" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bar_medal_design_proposal_batches"
  ADD CONSTRAINT "bar_medal_design_proposal_batches_created_by_admin_id_fkey"
  FOREIGN KEY ("created_by_admin_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bar_medal_design_proposal_batches"
  ADD CONSTRAINT "bar_medal_design_proposal_batches_sent_by_admin_id_fkey"
  FOREIGN KEY ("sent_by_admin_id") REFERENCES "users" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bar_medal_design_proposals"
  ADD CONSTRAINT "bar_medal_design_proposals_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "bar_medal_design_proposal_batches" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bar_medal_design_proposals"
  ADD CONSTRAINT "bar_medal_design_proposals_artwork_asset_id_fkey"
  FOREIGN KEY ("artwork_asset_id") REFERENCES "upload_assets" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- RESTRICT: no borrar propuestas referenciadas por una versión (medallas históricas / activas).
ALTER TABLE "bar_mission_medal_versions"
  ADD CONSTRAINT "bar_mission_medal_versions_selected_proposal_id_fkey"
  FOREIGN KEY ("selected_proposal_id") REFERENCES "bar_medal_design_proposals" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bar_medal_design_proposals"
  ADD CONSTRAINT "bar_medal_design_proposals_position_range_check"
  CHECK ("position" >= 1 AND "position" <= 5);
