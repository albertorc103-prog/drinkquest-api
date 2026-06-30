-- Nuevos planes SaaS + columna banner (enum values deben commitearse antes del UPDATE)
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'EXPLORER';
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'INTERMEDIATE';
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'LEGEND';

ALTER TABLE "bars" ADD COLUMN IF NOT EXISTS "banner_url" TEXT;
