-- Bebidas especializadas del local (Intermedio/Legend): hasta 3, COMMON, revisión admin.

DO $$ BEGIN
  CREATE TYPE "SpecialDrinkApprovalStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'FLAGGED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SpecialDrinkStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "bar_special_drinks" (
    "id" UUID NOT NULL,
    "bar_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "recipe" TEXT NOT NULL,
    "fun_fact" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "rarity" "DrinkRarity" NOT NULL DEFAULT 'COMMON',
    "is_limited_edition" BOOLEAN NOT NULL DEFAULT true,
    "status" "SpecialDrinkStatus" NOT NULL DEFAULT 'DRAFT',
    "approval_status" "SpecialDrinkApprovalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejection_reason" TEXT,
    "moderated_by_admin_id" UUID,
    "moderated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bar_special_drinks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bar_special_drinks_bar_id_idx" ON "bar_special_drinks"("bar_id");
CREATE INDEX IF NOT EXISTS "bar_special_drinks_approval_status_idx" ON "bar_special_drinks"("approval_status");
CREATE INDEX IF NOT EXISTS "bar_special_drinks_status_idx" ON "bar_special_drinks"("status");
CREATE INDEX IF NOT EXISTS "bar_special_drinks_deleted_at_idx" ON "bar_special_drinks"("deleted_at");

DO $$ BEGIN
  ALTER TABLE "bar_special_drinks"
    ADD CONSTRAINT "bar_special_drinks_bar_id_fkey"
    FOREIGN KEY ("bar_id") REFERENCES "bars"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
