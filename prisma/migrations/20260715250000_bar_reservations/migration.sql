-- CreateEnum
CREATE TYPE "BarReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "bar_reservations" (
    "id" UUID NOT NULL,
    "bar_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "guest_name" TEXT NOT NULL,
    "party_size" INTEGER NOT NULL,
    "reserved_for" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "BarReservationStatus" NOT NULL DEFAULT 'PENDING',
    "bar_response" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "bar_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bar_reservations_bar_id_status_idx" ON "bar_reservations"("bar_id", "status");
CREATE INDEX "bar_reservations_user_id_status_idx" ON "bar_reservations"("user_id", "status");
CREATE INDEX "bar_reservations_reserved_for_idx" ON "bar_reservations"("reserved_for");

-- AddForeignKey
ALTER TABLE "bar_reservations" ADD CONSTRAINT "bar_reservations_bar_id_fkey" FOREIGN KEY ("bar_id") REFERENCES "bars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bar_reservations" ADD CONSTRAINT "bar_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
