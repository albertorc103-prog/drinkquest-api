-- Voice notes on chat messages (max 30s enforced in API/app).
ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "audio_url" TEXT,
  ADD COLUMN IF NOT EXISTS "audio_duration_ms" INTEGER;
