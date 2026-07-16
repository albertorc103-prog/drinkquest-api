-- CreateEnum
CREATE TYPE "BarMissionTemplate" AS ENUM ('SCAN_ONCE', 'SCAN_TWO_DAYS', 'SCAN_TWO_DRINKS');

-- CreateEnum
CREATE TYPE "BarMissionSeasonStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "bar_mission_seasons" (
    "id" UUID NOT NULL,
    "bar_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "BarMissionSeasonStatus" NOT NULL DEFAULT 'DRAFT',
    "medal_title" TEXT NOT NULL,
    "medal_description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bar_mission_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bar_missions" (
    "id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "template" "BarMissionTemplate" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target_count" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bar_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_bar_mission_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mission_id" UUID NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_bar_mission_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_bar_medals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bar_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_bar_medals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bar_mission_seasons_bar_id_idx" ON "bar_mission_seasons"("bar_id");

-- CreateIndex
CREATE INDEX "bar_mission_seasons_status_idx" ON "bar_mission_seasons"("status");

-- CreateIndex
CREATE INDEX "bar_mission_seasons_starts_at_ends_at_idx" ON "bar_mission_seasons"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "bar_mission_seasons_deleted_at_idx" ON "bar_mission_seasons"("deleted_at");

-- CreateIndex
CREATE INDEX "bar_missions_season_id_idx" ON "bar_missions"("season_id");

-- CreateIndex
CREATE INDEX "user_bar_mission_progress_user_id_idx" ON "user_bar_mission_progress"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_bar_mission_progress_user_id_mission_id_key" ON "user_bar_mission_progress"("user_id", "mission_id");

-- CreateIndex
CREATE INDEX "user_bar_medals_user_id_idx" ON "user_bar_medals"("user_id");

-- CreateIndex
CREATE INDEX "user_bar_medals_bar_id_idx" ON "user_bar_medals"("bar_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_bar_medals_user_id_season_id_key" ON "user_bar_medals"("user_id", "season_id");

-- AddForeignKey
ALTER TABLE "bar_mission_seasons" ADD CONSTRAINT "bar_mission_seasons_bar_id_fkey" FOREIGN KEY ("bar_id") REFERENCES "bars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bar_missions" ADD CONSTRAINT "bar_missions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "bar_mission_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bar_mission_progress" ADD CONSTRAINT "user_bar_mission_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bar_mission_progress" ADD CONSTRAINT "user_bar_mission_progress_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "bar_missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bar_medals" ADD CONSTRAINT "user_bar_medals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bar_medals" ADD CONSTRAINT "user_bar_medals_bar_id_fkey" FOREIGN KEY ("bar_id") REFERENCES "bars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bar_medals" ADD CONSTRAINT "user_bar_medals_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "bar_mission_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
