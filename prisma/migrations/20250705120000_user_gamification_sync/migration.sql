-- Monedas y racha sincronizables entre dispositivos
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "coins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_streak_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_epoch_day" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "streak_bonus_tier_claimed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "daily_chest_claimed_day" INTEGER NOT NULL DEFAULT 0;
