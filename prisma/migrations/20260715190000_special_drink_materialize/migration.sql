-- Materialización de bebidas especializadas hacia drinks (para QR/unlock).

ALTER TABLE "drinks" ADD COLUMN IF NOT EXISTS "source_special_drink_id" UUID;
ALTER TABLE "drinks" ADD COLUMN IF NOT EXISTS "origin_bar_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "drinks_source_special_drink_id_key"
  ON "drinks"("source_special_drink_id");

CREATE INDEX IF NOT EXISTS "drinks_origin_bar_id_idx" ON "drinks"("origin_bar_id");

DO $$ BEGIN
  ALTER TABLE "drinks"
    ADD CONSTRAINT "drinks_source_special_drink_id_fkey"
    FOREIGN KEY ("source_special_drink_id") REFERENCES "bar_special_drinks"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
