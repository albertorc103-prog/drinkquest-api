-- CreateEnum
CREATE TYPE "RooftopVerificationStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RooftopPackageStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RooftopPackageApprovalStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'FLAGGED');

-- AlterTable
ALTER TABLE "bars" ADD COLUMN "has_outdoor_space" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bars" ADD COLUMN "rooftop_status" "RooftopVerificationStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "bars" ADD COLUMN "rooftop_rejection_reason" TEXT;
ALTER TABLE "bars" ADD COLUMN "rooftop_reviewed_at" TIMESTAMP(3);
ALTER TABLE "bars" ADD COLUMN "rooftop_reviewed_by_admin_id" UUID;

-- CreateIndex
CREATE INDEX "bars_rooftop_status_idx" ON "bars"("rooftop_status");

-- CreateTable
CREATE TABLE "bar_rooftop_packages" (
    "id" UUID NOT NULL,
    "bar_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT NOT NULL,
    "includes_food" BOOLEAN NOT NULL DEFAULT true,
    "includes_drinks" BOOLEAN NOT NULL DEFAULT true,
    "price_label" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "RooftopPackageStatus" NOT NULL DEFAULT 'DRAFT',
    "approval_status" "RooftopPackageApprovalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejection_reason" TEXT,
    "moderated_by_admin_id" UUID,
    "moderated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bar_rooftop_packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bar_rooftop_packages_bar_id_idx" ON "bar_rooftop_packages"("bar_id");
CREATE INDEX "bar_rooftop_packages_status_idx" ON "bar_rooftop_packages"("status");
CREATE INDEX "bar_rooftop_packages_approval_status_idx" ON "bar_rooftop_packages"("approval_status");
CREATE INDEX "bar_rooftop_packages_starts_at_ends_at_idx" ON "bar_rooftop_packages"("starts_at", "ends_at");
CREATE INDEX "bar_rooftop_packages_deleted_at_idx" ON "bar_rooftop_packages"("deleted_at");

-- AddForeignKey
ALTER TABLE "bar_rooftop_packages" ADD CONSTRAINT "bar_rooftop_packages_bar_id_fkey" FOREIGN KEY ("bar_id") REFERENCES "bars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
