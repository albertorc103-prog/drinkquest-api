-- CreateEnum
CREATE TYPE "FeedPostType" AS ENUM ('USER', 'UNLOCK', 'VISIT', 'ACHIEVEMENT');

-- AlterTable
ALTER TABLE "feed_posts" ADD COLUMN "type" "FeedPostType" NOT NULL DEFAULT 'USER';
ALTER TABLE "feed_posts" ADD COLUMN "meta" JSONB;

-- CreateIndex
CREATE INDEX "feed_posts_type_idx" ON "feed_posts"("type");
