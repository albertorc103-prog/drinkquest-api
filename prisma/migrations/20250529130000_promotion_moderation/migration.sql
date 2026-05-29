-- CreateEnum
CREATE TYPE "PromotionEventType" AS ENUM (
  'APPROVAL',
  'REJECTION',
  'FLAGGING',
  'ACTIVATION',
  'PAUSE',
  'RESUBMISSION'
);

-- RecreateEnum for approval status (PENDING -> PENDING_REVIEW + FLAGGED)
CREATE TYPE "PromotionApprovalStatus_new" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'FLAGGED'
);

ALTER TABLE "bar_promotions"
  ALTER COLUMN "approval_status" DROP DEFAULT,
  ALTER COLUMN "approval_status"
    TYPE "PromotionApprovalStatus_new"
    USING (
      CASE
        WHEN "approval_status"::text = 'PENDING' THEN 'PENDING_REVIEW'::"PromotionApprovalStatus_new"
        WHEN "approval_status"::text = 'APPROVED' THEN 'APPROVED'::"PromotionApprovalStatus_new"
        WHEN "approval_status"::text = 'REJECTED' THEN 'REJECTED'::"PromotionApprovalStatus_new"
        ELSE 'PENDING_REVIEW'::"PromotionApprovalStatus_new"
      END
    );

DROP TYPE "PromotionApprovalStatus";
ALTER TYPE "PromotionApprovalStatus_new" RENAME TO "PromotionApprovalStatus";

ALTER TABLE "bar_promotions"
  ALTER COLUMN "approval_status" SET DEFAULT 'PENDING_REVIEW',
  ADD COLUMN "rejection_reason" TEXT,
  ADD COLUMN "moderated_by_admin_id" UUID,
  ADD COLUMN "moderated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "bar_promotion_events" (
  "id" UUID NOT NULL,
  "promotion_id" UUID NOT NULL,
  "bar_id" UUID NOT NULL,
  "event_type" "PromotionEventType" NOT NULL,
  "actor_user_id" UUID,
  "reason" TEXT,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bar_promotion_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bar_promotions_moderated_by_admin_id_idx" ON "bar_promotions"("moderated_by_admin_id");

-- CreateIndex
CREATE INDEX "bar_promotion_events_promotion_id_created_at_idx" ON "bar_promotion_events"("promotion_id", "created_at");

-- CreateIndex
CREATE INDEX "bar_promotion_events_bar_id_created_at_idx" ON "bar_promotion_events"("bar_id", "created_at");

-- AddForeignKey
ALTER TABLE "bar_promotion_events" ADD CONSTRAINT "bar_promotion_events_promotion_id_fkey"
FOREIGN KEY ("promotion_id") REFERENCES "bar_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
