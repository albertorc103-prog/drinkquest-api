-- Reply-to + message reactions for chat

ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "reply_to_id" UUID;

CREATE INDEX IF NOT EXISTS "chat_messages_reply_to_id_idx" ON "chat_messages"("reply_to_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_reply_to_id_fkey'
  ) THEN
    ALTER TABLE "chat_messages"
      ADD CONSTRAINT "chat_messages_reply_to_id_fkey"
      FOREIGN KEY ("reply_to_id") REFERENCES "chat_messages"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "message_reactions" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "message_reactions_message_id_user_id_emoji_key"
  ON "message_reactions"("message_id", "user_id", "emoji");

CREATE INDEX IF NOT EXISTS "message_reactions_message_id_idx"
  ON "message_reactions"("message_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'message_reactions_message_id_fkey'
  ) THEN
    ALTER TABLE "message_reactions"
      ADD CONSTRAINT "message_reactions_message_id_fkey"
      FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'message_reactions_user_id_fkey'
  ) THEN
    ALTER TABLE "message_reactions"
      ADD CONSTRAINT "message_reactions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
