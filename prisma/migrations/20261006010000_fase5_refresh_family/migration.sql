-- FASE 5: refresh token family para reuse detection
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "family_id" UUID;

-- Filas legacy: cada token es su propia familia
UPDATE "refresh_tokens"
SET "family_id" = "id"
WHERE "family_id" IS NULL;

ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "refresh_tokens_family_id_idx" ON "refresh_tokens" ("family_id");
