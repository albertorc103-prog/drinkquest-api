-- FASE 3: dejar de exigir coords exactas del usuario en place_visits (minimización).
-- No se borran datos históricos; nuevas visitas escribirán NULL.
ALTER TABLE "place_visits" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "place_visits" ALTER COLUMN "longitude" DROP NOT NULL;
