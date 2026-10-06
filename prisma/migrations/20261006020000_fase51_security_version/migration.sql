-- FASE 5.1: invalidación inmediata de access tokens + cadena de rotación refresh
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "security_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "replaced_by_id" UUID;
