-- Coordenadas del local para aparición destacada en el mapa (plan con suscripción).
ALTER TABLE "bars" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "bars" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
