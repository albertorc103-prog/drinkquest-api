-- Preferencias de notificaciones push por usuario
CREATE TABLE "user_notification_preferences" (
    "user_id" UUID NOT NULL,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reservations_enabled" BOOLEAN NOT NULL DEFAULT true,
    "moderation_enabled" BOOLEAN NOT NULL DEFAULT true,
    "chat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
