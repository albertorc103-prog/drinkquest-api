-- FASE 2: verificación de mayoría de edad sin persistir fecha de nacimiento.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age_verified_at" TIMESTAMP(3);
