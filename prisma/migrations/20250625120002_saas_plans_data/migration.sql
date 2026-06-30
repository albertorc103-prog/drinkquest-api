-- Paso 3: migrar datos legacy (después de que el enum ya tenga los nuevos valores)
UPDATE "bar_subscriptions" SET "plan" = 'EXPLORER' WHERE "plan"::text = 'BASIC';
UPDATE "bar_subscriptions" SET "plan" = 'INTERMEDIATE' WHERE "plan"::text = 'PRO';

ALTER TABLE "bar_subscriptions" ALTER COLUMN "plan" SET DEFAULT 'EXPLORER';
