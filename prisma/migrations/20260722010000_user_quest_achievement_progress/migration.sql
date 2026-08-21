-- Persist local catalog quest/achievement progress per user account.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "quest_progress" JSONB;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "achievement_progress" JSONB;
