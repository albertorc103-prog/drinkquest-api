import { Prisma } from '@prisma/client';

export type MedalModerationAuditEvent = {
  at: string;
  action:
    | 'CHANGES_REQUESTED'
    | 'CORRECTION_REQUIRED'
    | 'RESUBMITTED'
    | 'APPROVED'
    | 'ACTIVATED'
    | 'APPROVE_AND_ACTIVATE'
    | 'ADMIN_REJECT_TERMINAL';
  adminId?: string | null;
  reason?: string | null;
};

export const MODERATION_AUDIT_DESIGN_CONFIG_KEY = '_moderationAudit';

const AUDIT_KEY = MODERATION_AUDIT_DESIGN_CONFIG_KEY;

/** Quita auditoría interna antes de validar o exponer designConfig al BAR/usuario. */
export function stripModerationAuditFromDesignConfigRaw(
  raw: unknown,
): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const { [AUDIT_KEY]: _removed, ...rest } = raw as Record<string, unknown>;
  return rest;
}

/** Conserva historial de auditoría al actualizar el JSON visual de la versión. */
export function mergeDesignConfigPreservingModerationAudit(
  existing: Prisma.JsonValue | null,
  nextVisual: Prisma.InputJsonValue,
): Prisma.InputJsonValue {
  const history = readAudit(existing);
  const base = stripModerationAuditFromDesignConfigRaw(nextVisual);
  const visual =
    base != null && typeof base === 'object' && !Array.isArray(base)
      ? { ...(base as Record<string, unknown>) }
      : {};
  if (history.length === 0) return visual as Prisma.InputJsonValue;
  return { ...visual, [AUDIT_KEY]: history } as Prisma.InputJsonValue;
}

function readAudit(
  designConfig: Prisma.JsonValue | Prisma.InputJsonValue | null,
): MedalModerationAuditEvent[] {
  if (!designConfig || typeof designConfig !== 'object' || Array.isArray(designConfig)) {
    return [];
  }
  const raw = (designConfig as Record<string, unknown>)[AUDIT_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is MedalModerationAuditEvent => {
    return (
      e != null &&
      typeof e === 'object' &&
      typeof (e as MedalModerationAuditEvent).at === 'string' &&
      typeof (e as MedalModerationAuditEvent).action === 'string'
    );
  });
}

export function appendModerationAuditEvent(
  designConfig: Prisma.JsonValue | Prisma.InputJsonValue | null,
  event: Omit<MedalModerationAuditEvent, 'at'> & { at?: string },
): Prisma.InputJsonValue {
  const base =
    designConfig != null && typeof designConfig === 'object' && !Array.isArray(designConfig)
      ? { ...(designConfig as Record<string, unknown>) }
      : {};
  const history = readAudit(designConfig);
  const entry: MedalModerationAuditEvent = {
    at: event.at ?? new Date().toISOString(),
    action: event.action,
    adminId: event.adminId ?? null,
    reason: event.reason ?? null,
  };
  return {
    ...base,
    [AUDIT_KEY]: [...history, entry],
  } as Prisma.InputJsonValue;
}

export function extractModerationAudit(
  designConfig: Prisma.JsonValue | Prisma.InputJsonValue | null,
): MedalModerationAuditEvent[] {
  return readAudit(designConfig);
}
