-- CreateEnum
CREATE TYPE "PromotionEventTheme" AS ENUM ('STANDARD', 'CHRISTMAS', 'NEW_YEAR', 'HALLOWEEN', 'NOCHE_MEXICANA', 'ANNIVERSARY');

-- AlterTable
ALTER TABLE "bar_promotions" ADD COLUMN "event_theme" "PromotionEventTheme" NOT NULL DEFAULT 'STANDARD';

-- CreateIndex
CREATE INDEX "bar_promotions_event_theme_idx" ON "bar_promotions"("event_theme");
