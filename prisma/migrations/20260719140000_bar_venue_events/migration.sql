-- CreateEnum
CREATE TYPE "VenueEventStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VenueEventModerationStatus" AS ENUM ('VISIBLE', 'REMOVED');

-- CreateTable
CREATE TABLE "bar_venue_events" (
    "id" UUID NOT NULL,
    "bar_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "VenueEventStatus" NOT NULL DEFAULT 'DRAFT',
    "moderation_status" "VenueEventModerationStatus" NOT NULL DEFAULT 'VISIBLE',
    "removal_reason" TEXT,
    "removed_by_admin_id" UUID,
    "removed_at" TIMESTAMP(3),
    "policies_accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bar_venue_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bar_venue_events_bar_id_idx" ON "bar_venue_events"("bar_id");

-- CreateIndex
CREATE INDEX "bar_venue_events_status_idx" ON "bar_venue_events"("status");

-- CreateIndex
CREATE INDEX "bar_venue_events_moderation_status_idx" ON "bar_venue_events"("moderation_status");

-- CreateIndex
CREATE INDEX "bar_venue_events_starts_at_ends_at_idx" ON "bar_venue_events"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "bar_venue_events_deleted_at_idx" ON "bar_venue_events"("deleted_at");

-- AddForeignKey
ALTER TABLE "bar_venue_events" ADD CONSTRAINT "bar_venue_events_bar_id_fkey" FOREIGN KEY ("bar_id") REFERENCES "bars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
