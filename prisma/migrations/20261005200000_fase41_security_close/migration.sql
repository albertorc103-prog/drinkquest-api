-- FASE 4.1: reward ledger, upload ownership, review unique, report REVIEW/MESSAGE targets

-- ReportTargetType: REVIEW
ALTER TYPE "ReportTargetType" ADD VALUE IF NOT EXISTS 'REVIEW';

-- Reports: target review / message
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "target_review_id" UUID;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "target_message_id" UUID;
CREATE INDEX IF NOT EXISTS "reports_reporter_id_target_type_target_review_id_idx"
  ON "reports" ("reporter_id", "target_type", "target_review_id");
CREATE INDEX IF NOT EXISTS "reports_reporter_id_target_type_target_message_id_idx"
  ON "reports" ("reporter_id", "target_type", "target_message_id");

-- Gamification reward ledger (idempotency)
CREATE TABLE IF NOT EXISTS "gamification_rewards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gamification_rewards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "gamification_rewards_user_id_source_type_source_id_key"
  ON "gamification_rewards" ("user_id", "source_type", "source_id");
CREATE INDEX IF NOT EXISTS "gamification_rewards_user_id_created_at_idx"
  ON "gamification_rewards" ("user_id", "created_at");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gamification_rewards_user_id_fkey'
  ) THEN
    ALTER TABLE "gamification_rewards"
      ADD CONSTRAINT "gamification_rewards_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Upload ownership metadata
CREATE TABLE IF NOT EXISTS "upload_assets" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "folder" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "public_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "upload_assets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "upload_assets_object_key_key" ON "upload_assets" ("object_key");
CREATE INDEX IF NOT EXISTS "upload_assets_owner_user_id_created_at_idx"
  ON "upload_assets" ("owner_user_id", "created_at");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'upload_assets_owner_user_id_fkey'
  ) THEN
    ALTER TABLE "upload_assets"
      ADD CONSTRAINT "upload_assets_owner_user_id_fkey"
      FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- PlaceReview place_key + unique (solo si no hay duplicados)
ALTER TABLE "place_reviews" ADD COLUMN IF NOT EXISTS "place_key" TEXT;
UPDATE "place_reviews"
SET "place_key" = COALESCE("google_place_id", 'bar:' || "bar_id"::text)
WHERE "place_key" IS NULL OR "place_key" = '';

DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT 1
    FROM place_reviews
    GROUP BY user_id, COALESCE(google_place_id, 'bar:' || bar_id::text)
    HAVING COUNT(*) > 1
  ) d;

  ALTER TABLE "place_reviews" ALTER COLUMN "place_key" SET NOT NULL;

  IF dup_count = 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'place_reviews_user_id_place_key_key'
    ) THEN
      CREATE UNIQUE INDEX "place_reviews_user_id_place_key_key"
        ON "place_reviews" ("user_id", "place_key");
    END IF;
  ELSE
    RAISE NOTICE 'FASE 4.1: % grupos de PlaceReview duplicados — UNIQUE no aplicado. Resolver manualmente.', dup_count;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "place_reviews_place_key_created_at_idx"
  ON "place_reviews" ("place_key", "created_at");
