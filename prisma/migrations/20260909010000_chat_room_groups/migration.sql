-- CreateEnum
CREATE TYPE "ChatRoomType" AS ENUM ('DIRECT', 'GROUP');

-- AlterTable
ALTER TABLE "chat_rooms" ADD COLUMN "type" "ChatRoomType" NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "chat_rooms" ADD COLUMN "name" TEXT;
ALTER TABLE "chat_rooms" ADD COLUMN "avatar_url" TEXT;
ALTER TABLE "chat_rooms" ADD COLUMN "created_by_id" UUID;

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "chat_rooms_type_idx" ON "chat_rooms"("type");
