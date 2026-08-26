-- AlterTable
ALTER TABLE "chat_participants" ADD COLUMN IF NOT EXISTS "hidden_at" TIMESTAMP(3);
