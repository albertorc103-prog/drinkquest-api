-- CreateEnum
CREATE TYPE "PromotionAnalyticsEventType" AS ENUM ('IMPRESSION', 'OPEN', 'QR_SCAN');

-- CreateTable
CREATE TABLE "promotion_analytics_events" (
  "id" UUID NOT NULL,
  "promotion_id" UUID NOT NULL,
  "user_id" UUID,
  "event_type" "PromotionAnalyticsEventType" NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "promotion_analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotion_analytics_events_promotion_id_created_at_idx"
  ON "promotion_analytics_events"("promotion_id", "created_at");

-- CreateIndex
CREATE INDEX "promotion_analytics_events_event_type_created_at_idx"
  ON "promotion_analytics_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "promotion_analytics_events_user_id_idx"
  ON "promotion_analytics_events"("user_id");

-- AddForeignKey
ALTER TABLE "promotion_analytics_events" ADD CONSTRAINT "promotion_analytics_events_promotion_id_fkey"
FOREIGN KEY ("promotion_id") REFERENCES "bar_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
