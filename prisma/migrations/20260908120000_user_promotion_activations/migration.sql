-- CreateTable
CREATE TABLE "user_promotion_activations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "promotion_id" UUID NOT NULL,
    "bar_id" UUID NOT NULL,
    "xp_earned" INTEGER NOT NULL DEFAULT 0,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_promotion_activations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_promotion_activations_user_id_expires_at_idx" ON "user_promotion_activations"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "user_promotion_activations_promotion_id_idx" ON "user_promotion_activations"("promotion_id");

-- CreateIndex
CREATE INDEX "user_promotion_activations_bar_id_idx" ON "user_promotion_activations"("bar_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_promotion_activations_user_id_promotion_id_key" ON "user_promotion_activations"("user_id", "promotion_id");

-- AddForeignKey
ALTER TABLE "user_promotion_activations" ADD CONSTRAINT "user_promotion_activations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_promotion_activations" ADD CONSTRAINT "user_promotion_activations_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "bar_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
