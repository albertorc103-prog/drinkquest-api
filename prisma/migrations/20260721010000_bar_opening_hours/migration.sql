-- Horario estructurado del local (visible en mapa / perfil).
ALTER TABLE "bars" ADD COLUMN IF NOT EXISTS "opening_hours" JSONB;
