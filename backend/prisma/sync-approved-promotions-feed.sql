-- Sincroniza promociones ya aprobadas para que cumplan el filtro del feed de cliente.
-- Condiciones del feed: status ACTIVE, approval_status APPROVED, starts_at <= now(), ends_at > now(),
-- bar activo y suscripción con promo_enabled (TRIAL/ACTIVE vigente).
-- No requiere migración de esquema; solo actualización de datos.
-- Ejecutar en producción tras desplegar el backend corregido.

BEGIN;

-- 1) Activar promos aprobadas no vencidas que siguen en DRAFT/PAUSED/etc.
UPDATE bar_promotions
SET
  status = 'ACTIVE',
  updated_at = NOW()
WHERE approval_status = 'APPROVED'
  AND ends_at > NOW()
  AND status IS DISTINCT FROM 'ACTIVE';

-- 2) Adelantar inicio si quedó programado en el futuro (impide starts_at <= now en el feed).
UPDATE bar_promotions
SET
  starts_at = NOW(),
  updated_at = NOW()
WHERE approval_status = 'APPROVED'
  AND ends_at > NOW()
  AND starts_at > NOW();

COMMIT;

-- Verificación (opcional): promos que deberían verse si bar + suscripción OK
-- SELECT bp.id, bp.title, bp.status, bp.approval_status, bp.starts_at, bp.ends_at, b.is_active
-- FROM bar_promotions bp
-- JOIN bars b ON b.id = bp.bar_id
-- WHERE bp.approval_status = 'APPROVED'
--   AND bp.status = 'ACTIVE'
--   AND bp.starts_at <= NOW()
--   AND bp.ends_at > NOW()
--   AND b.deleted_at IS NULL
--   AND b.is_active = true;
