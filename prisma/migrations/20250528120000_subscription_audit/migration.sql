-- CreateEnum
CREATE TYPE "SubscriptionEventType" AS ENUM (
  'ACTIVATED',
  'SUSPENDED',
  'REACTIVATED',
  'TRIAL_EXTENDED',
  'QR_ENABLED',
  'QR_DISABLED',
  'PROMO_ENABLED',
  'PROMO_DISABLED',
  'STATUS_CHANGED'
);

-- AlterTable
ALTER TABLE "bar_subscriptions"
  ADD COLUMN "updated_by_admin_id" UUID,
  ADD COLUMN "last_status_changed_at" TIMESTAMP(3),
  ADD COLUMN "status_reason" TEXT;

-- CreateIndex
CREATE INDEX "bar_subscriptions_updated_by_admin_id_idx" ON "bar_subscriptions"("updated_by_admin_id");

-- CreateTable
CREATE TABLE "bar_subscription_events" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "bar_id" UUID NOT NULL,
    "event_type" "SubscriptionEventType" NOT NULL,
    "actor_user_id" UUID,
    "actor_source" TEXT NOT NULL DEFAULT 'admin',
    "previous_status" "SubscriptionStatus",
    "new_status" "SubscriptionStatus",
    "reason" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bar_subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bar_subscription_events_bar_id_created_at_idx" ON "bar_subscription_events"("bar_id", "created_at");

-- CreateIndex
CREATE INDEX "bar_subscription_events_subscription_id_idx" ON "bar_subscription_events"("subscription_id");

-- AddForeignKey
ALTER TABLE "bar_subscription_events" ADD CONSTRAINT "bar_subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "bar_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
