-- CreateTable place_reviews
CREATE TABLE "place_reviews" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bar_id" UUID,
    "external_place_id" UUID,
    "google_place_id" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "place_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "place_reviews_identity_chk" CHECK ("bar_id" IS NOT NULL OR "google_place_id" IS NOT NULL),
    CONSTRAINT "place_reviews_rating_chk" CHECK ("rating" >= 1 AND "rating" <= 5)
);

CREATE INDEX "place_reviews_user_id_created_at_idx" ON "place_reviews"("user_id", "created_at");
CREATE INDEX "place_reviews_google_place_id_created_at_idx" ON "place_reviews"("google_place_id", "created_at");
CREATE INDEX "place_reviews_bar_id_created_at_idx" ON "place_reviews"("bar_id", "created_at");

-- Una opinión por usuario + identidad Google
CREATE UNIQUE INDEX "place_reviews_user_google_uq"
  ON "place_reviews" ("user_id", "google_place_id")
  WHERE "google_place_id" IS NOT NULL;

-- Una opinión por usuario + Bar sin googlePlaceId
CREATE UNIQUE INDEX "place_reviews_user_bar_no_google_uq"
  ON "place_reviews" ("user_id", "bar_id")
  WHERE "bar_id" IS NOT NULL AND "google_place_id" IS NULL;

ALTER TABLE "place_reviews"
  ADD CONSTRAINT "place_reviews_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "place_reviews"
  ADD CONSTRAINT "place_reviews_bar_id_fkey"
  FOREIGN KEY ("bar_id") REFERENCES "bars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "place_reviews"
  ADD CONSTRAINT "place_reviews_external_place_id_fkey"
  FOREIGN KEY ("external_place_id") REFERENCES "external_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
