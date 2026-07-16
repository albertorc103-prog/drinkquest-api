-- CreateEnum
CREATE TYPE "GlobalEventStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "GlobalEventGoalType" AS ENUM ('VISIT_BARS');

-- CreateTable
CREATE TABLE "global_events" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image_url" TEXT,
    "goal_type" "GlobalEventGoalType" NOT NULL DEFAULT 'VISIT_BARS',
    "target_count" INTEGER NOT NULL DEFAULT 3,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "GlobalEventStatus" NOT NULL DEFAULT 'DRAFT',
    "medal_title" TEXT NOT NULL,
    "medal_description" TEXT NOT NULL,
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "global_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "global_event_bars" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "bar_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_event_bars_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_global_event_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_global_event_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_global_event_medals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_global_event_medals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "global_events_status_idx" ON "global_events"("status");
CREATE INDEX "global_events_starts_at_ends_at_idx" ON "global_events"("starts_at", "ends_at");
CREATE INDEX "global_events_deleted_at_idx" ON "global_events"("deleted_at");
CREATE UNIQUE INDEX "global_event_bars_event_id_bar_id_key" ON "global_event_bars"("event_id", "bar_id");
CREATE INDEX "global_event_bars_bar_id_idx" ON "global_event_bars"("bar_id");
CREATE UNIQUE INDEX "user_global_event_progress_user_id_event_id_key" ON "user_global_event_progress"("user_id", "event_id");
CREATE INDEX "user_global_event_progress_event_id_idx" ON "user_global_event_progress"("event_id");
CREATE UNIQUE INDEX "user_global_event_medals_user_id_event_id_key" ON "user_global_event_medals"("user_id", "event_id");
CREATE INDEX "user_global_event_medals_event_id_idx" ON "user_global_event_medals"("event_id");

-- AddForeignKey
ALTER TABLE "global_event_bars" ADD CONSTRAINT "global_event_bars_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "global_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "global_event_bars" ADD CONSTRAINT "global_event_bars_bar_id_fkey" FOREIGN KEY ("bar_id") REFERENCES "bars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_global_event_progress" ADD CONSTRAINT "user_global_event_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_global_event_progress" ADD CONSTRAINT "user_global_event_progress_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "global_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_global_event_medals" ADD CONSTRAINT "user_global_event_medals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_global_event_medals" ADD CONSTRAINT "user_global_event_medals_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "global_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
