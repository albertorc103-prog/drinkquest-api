-- Migrar planes legacy y fijar default Explorer (transacción separada del ALTER TYPE)
UPDATE "bar_subscriptions" SET "plan" = 'EXPLORER' WHERE "plan" = 'BASIC';
UPDATE "bar_subscriptions" SET "plan" = 'INTERMEDIATE' WHERE "plan" = 'PRO';

ALTER TABLE "bar_subscriptions" ALTER COLUMN "plan" SET DEFAULT 'EXPLORER';
