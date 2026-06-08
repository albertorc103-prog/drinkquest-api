-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('BASIC', 'PRO');

-- CreateTable
CREATE TABLE "bar_subscriptions" (
    "id" UUID NOT NULL,
    "bar_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'BASIC',
    "current_period_end" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "qr_enabled" BOOLEAN NOT NULL DEFAULT true,
    "promo_enabled" BOOLEAN NOT NULL DEFAULT true,
    "canceled_at" TIMESTAMP(3),
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bar_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bar_subscriptions_bar_id_key" ON "bar_subscriptions"("bar_id");

-- CreateIndex
CREATE UNIQUE INDEX "bar_subscriptions_stripe_customer_id_key" ON "bar_subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "bar_subscriptions_stripe_subscription_id_key" ON "bar_subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "bar_subscriptions_status_idx" ON "bar_subscriptions"("status");

-- CreateIndex
CREATE INDEX "bar_subscriptions_current_period_end_idx" ON "bar_subscriptions"("current_period_end");

-- CreateIndex
CREATE INDEX "bar_subscriptions_trial_ends_at_idx" ON "bar_subscriptions"("trial_ends_at");

-- AddForeignKey
ALTER TABLE "bar_subscriptions" ADD CONSTRAINT "bar_subscriptions_bar_id_fkey" FOREIGN KEY ("bar_id") REFERENCES "bars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: trial para bares existentes sin suscripción
INSERT INTO "bar_subscriptions" (
    "id",
    "bar_id",
    "status",
    "plan",
    "trial_ends_at",
    "current_period_end",
    "qr_enabled",
    "promo_enabled",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    b."id",
    'TRIAL'::"SubscriptionStatus",
    'BASIC'::"SubscriptionPlan",
    (NOW() AT TIME ZONE 'UTC') + INTERVAL '14 days',
    (NOW() AT TIME ZONE 'UTC') + INTERVAL '14 days',
    true,
    true,
    NOW()
FROM "bars" b
WHERE b."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "bar_subscriptions" s WHERE s."bar_id" = b."id"
  );
