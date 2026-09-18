-- CreateEnum
CREATE TYPE "PlaceVisitRewardTier" AS ENUM ('SUBSCRIBED', 'STANDARD');

-- AlterTable bars (aditivo)
ALTER TABLE "bars" ADD COLUMN "google_place_id" TEXT;
ALTER TABLE "bars" ADD COLUMN "check_in_radius_meters" INTEGER;

CREATE UNIQUE INDEX "bars_google_place_id_key" ON "bars"("google_place_id");

-- CreateTable external_places
CREATE TABLE "external_places" (
    "id" UUID NOT NULL,
    "google_place_id" TEXT NOT NULL,
    "name" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "primary_type" TEXT,
    "city" TEXT,
    "content_cached_at" TIMESTAMP(3),
    "place_id_refreshed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_places_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_places_google_place_id_key" ON "external_places"("google_place_id");

-- CreateTable place_visits
CREATE TABLE "place_visits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bar_id" UUID,
    "external_place_id" UUID,
    "google_place_id" TEXT,
    "visit_date" DATE NOT NULL,
    "visited_at" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "distance_meters" DOUBLE PRECISION NOT NULL,
    "xp_awarded" INTEGER NOT NULL,
    "first_visit" BOOLEAN NOT NULL,
    "reward_tier" "PlaceVisitRewardTier" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_visits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "place_visits_identity_chk" CHECK ("bar_id" IS NOT NULL OR "external_place_id" IS NOT NULL)
);

CREATE INDEX "place_visits_user_id_visited_at_idx" ON "place_visits"("user_id", "visited_at");
CREATE INDEX "place_visits_user_id_google_place_id_visited_at_idx" ON "place_visits"("user_id", "google_place_id", "visited_at");
CREATE INDEX "place_visits_user_id_bar_id_visited_at_idx" ON "place_visits"("user_id", "bar_id", "visited_at");
CREATE INDEX "place_visits_user_id_external_place_id_visited_at_idx" ON "place_visits"("user_id", "external_place_id", "visited_at");

-- Una visita válida/día por identidad Google (cubre ExternalPlace → Bar el mismo día)
CREATE UNIQUE INDEX "place_visits_user_google_day_uq"
  ON "place_visits" ("user_id", "google_place_id", "visit_date")
  WHERE "google_place_id" IS NOT NULL;

-- Bars sin googlePlaceId todavía
CREATE UNIQUE INDEX "place_visits_user_bar_day_no_google_uq"
  ON "place_visits" ("user_id", "bar_id", "visit_date")
  WHERE "bar_id" IS NOT NULL AND "google_place_id" IS NULL;

ALTER TABLE "place_visits"
  ADD CONSTRAINT "place_visits_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "place_visits"
  ADD CONSTRAINT "place_visits_bar_id_fkey"
  FOREIGN KEY ("bar_id") REFERENCES "bars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "place_visits"
  ADD CONSTRAINT "place_visits_external_place_id_fkey"
  FOREIGN KEY ("external_place_id") REFERENCES "external_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
