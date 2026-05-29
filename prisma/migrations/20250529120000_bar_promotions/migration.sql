-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PromotionPlacementType" AS ENUM ('STANDARD', 'FEATURED', 'BOOSTED');

-- CreateEnum
CREATE TYPE "PromotionApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "bar_promotions" (
    "id" UUID NOT NULL,
    "bar_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "placement_type" "PromotionPlacementType" NOT NULL DEFAULT 'STANDARD',
    "approval_status" "PromotionApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "ranking_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bar_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bar_promotions_bar_id_idx" ON "bar_promotions"("bar_id");

-- CreateIndex
CREATE INDEX "bar_promotions_status_idx" ON "bar_promotions"("status");

-- CreateIndex
CREATE INDEX "bar_promotions_starts_at_idx" ON "bar_promotions"("starts_at");

-- CreateIndex
CREATE INDEX "bar_promotions_ends_at_idx" ON "bar_promotions"("ends_at");

-- CreateIndex
CREATE INDEX "bar_promotions_placement_type_idx" ON "bar_promotions"("placement_type");

-- CreateIndex
CREATE INDEX "bar_promotions_approval_status_idx" ON "bar_promotions"("approval_status");

-- CreateIndex
CREATE INDEX "bar_promotions_ranking_score_idx" ON "bar_promotions"("ranking_score");

-- AddForeignKey
ALTER TABLE "bar_promotions" ADD CONSTRAINT "bar_promotions_bar_id_fkey" FOREIGN KEY ("bar_id") REFERENCES "bars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
