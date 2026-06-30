-- Paso 1: columna banner (sin tocar el enum en la misma transacción)
ALTER TABLE "bars" ADD COLUMN IF NOT EXISTS "banner_url" TEXT;
