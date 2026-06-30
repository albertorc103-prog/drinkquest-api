-- Paso 2: nuevos valores del enum (transacción separada del UPDATE)
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'EXPLORER';
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'INTERMEDIATE';
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'LEGEND';
