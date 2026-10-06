-- FASE 1: FKs seguras para eliminación de cuenta (SetNull en lugar de Restrict/Cascade destructivo).

-- Bar: owner puede desvincularse al eliminar cuenta sin borrar el establecimiento.
ALTER TABLE "bars" DROP CONSTRAINT IF EXISTS "bars_owner_user_id_fkey";
ALTER TABLE "bars" ALTER COLUMN "owner_user_id" DROP NOT NULL;
ALTER TABLE "bars" ADD CONSTRAINT "bars_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reservas: conservar fila del local anonimizando al usuario.
ALTER TABLE "bar_reservations" DROP CONSTRAINT IF EXISTS "bar_reservations_user_id_fkey";
ALTER TABLE "bar_reservations" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "bar_reservations" ADD CONSTRAINT "bar_reservations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- QR históricos: conservar sesión del negocio sin vínculo personal.
ALTER TABLE "qr_sessions" DROP CONSTRAINT IF EXISTS "qr_sessions_scanned_by_id_fkey";
ALTER TABLE "qr_sessions" ADD CONSTRAINT "qr_sessions_scanned_by_id_fkey"
  FOREIGN KEY ("scanned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reports: conservar evidencia de moderación anonimizando identidades.
ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_reporter_id_fkey";
ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_target_user_id_fkey";
ALTER TABLE "reports" ALTER COLUMN "reporter_id" DROP NOT NULL;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey"
  FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
