-- Planes SaaS Explorer / Intermedio / Legend + banner del local
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'EXPLORER';
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'INTERMEDIATE';
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'LEGEND';

ALTER TABLE "bars" ADD COLUMN IF NOT EXISTS "banner_url" TEXT;

UPDATE "bar_subscriptions" SET "plan" = 'EXPLORER' WHERE "plan" = 'BASIC';
UPDATE "bar_subscriptions" SET "plan" = 'INTERMEDIATE' WHERE "plan" = 'PRO';

ALTER TABLE "bar_subscriptions" ALTER COLUMN "plan" SET DEFAULT 'EXPLORER';
