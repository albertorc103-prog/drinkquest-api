import { BadRequestException, ConflictException } from '@nestjs/common';
import { BarMissionMedalVersionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** Versiones que cuentan como expediente en curso (no histórico terminal). */
export const OFFICIAL_WORKFLOW_OPEN_STATUSES: BarMissionMedalVersionStatus[] = [
  BarMissionMedalVersionStatus.DRAFT,
  BarMissionMedalVersionStatus.CHANGES_REQUESTED,
  BarMissionMedalVersionStatus.PENDING_REVIEW,
  BarMissionMedalVersionStatus.APPROVED,
];

const WORKFLOW_PRIORITY: Record<BarMissionMedalVersionStatus, number> = {
  [BarMissionMedalVersionStatus.PENDING_REVIEW]: 50,
  [BarMissionMedalVersionStatus.APPROVED]: 40,
  [BarMissionMedalVersionStatus.CHANGES_REQUESTED]: 30,
  [BarMissionMedalVersionStatus.DRAFT]: 20,
  [BarMissionMedalVersionStatus.ACTIVE]: 100,
  [BarMissionMedalVersionStatus.DISABLED]: 0,
  [BarMissionMedalVersionStatus.REJECTED]: 0,
};

export type OfficialMedalWorkflowRow = {
  id: string;
  seasonId: string;
  version: number;
  status: BarMissionMedalVersionStatus;
  submittedAt: Date | null;
  updatedAt: Date;
};

/** Todas las versiones de medalla del establecimiento (temporadas no borradas). */
export async function findOfficialMedalVersionsForBar(
  prisma: PrismaService | Prisma.TransactionClient,
  barId: string,
): Promise<OfficialMedalWorkflowRow[]> {
  return prisma.barMissionMedalVersion.findMany({
    where: {
      season: { barId, deletedAt: null },
      status: { not: BarMissionMedalVersionStatus.DISABLED },
    },
    select: {
      id: true,
      seasonId: true,
      version: true,
      status: true,
      submittedAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: 'desc' }],
  });
}

export function pickCanonicalOfficialWorkflowVersion(
  rows: OfficialMedalWorkflowRow[],
): OfficialMedalWorkflowRow | null {
  const active = rows.filter((r) => r.status === BarMissionMedalVersionStatus.ACTIVE);
  if (active.length === 1) return active[0];
  if (active.length > 1) {
    return active.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  }
  const open = rows.filter((r) => OFFICIAL_WORKFLOW_OPEN_STATUSES.includes(r.status));
  if (open.length === 0) return null;
  return open.sort((a, b) => {
    const dp = WORKFLOW_PRIORITY[b.status] - WORKFLOW_PRIORITY[a.status];
    if (dp !== 0) return dp;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  })[0];
}

/**
 * Impide abrir un segundo expediente oficial en otra temporada.
 */
export async function assertSingleOfficialMedalWorkflow(
  prisma: PrismaService | Prisma.TransactionClient,
  barId: string,
  actingSeasonId: string,
): Promise<void> {
  const rows = await findOfficialMedalVersionsForBar(prisma, barId);
  const activeOtherSeason = rows.find(
    (r) =>
      r.status === BarMissionMedalVersionStatus.ACTIVE &&
      r.seasonId !== actingSeasonId,
  );
  if (activeOtherSeason) {
    throw new ConflictException(
      'BAR_OFFICIAL_MEDAL_ALREADY_ACTIVE: ya existe una medalla oficial activa en otra temporada.',
    );
  }
  const openElsewhere = rows.find(
    (r) =>
      OFFICIAL_WORKFLOW_OPEN_STATUSES.includes(r.status) &&
      r.seasonId !== actingSeasonId,
  );
  if (openElsewhere) {
    throw new ConflictException(
      'BAR_OFFICIAL_MEDAL_WORKFLOW_IN_PROGRESS: ya hay una solicitud oficial en curso en otra temporada.',
    );
  }
}

export async function assertCanStartOfficialDraft(
  prisma: PrismaService | Prisma.TransactionClient,
  barId: string,
  seasonId: string,
): Promise<void> {
  const rows = await findOfficialMedalVersionsForBar(prisma, barId);
  const canonical = pickCanonicalOfficialWorkflowVersion(rows);
  if (!canonical) return;
  if (canonical.seasonId === seasonId) {
    throw new ConflictException(
      'Ya existe una versión de medalla en esta temporada. Edita el borrador o continúa la solicitud.',
    );
  }
  await assertSingleOfficialMedalWorkflow(prisma, barId, seasonId);
  if (canonical.status === BarMissionMedalVersionStatus.ACTIVE) {
    throw new BadRequestException(
      'BAR_OFFICIAL_MEDAL_EXISTS: usa la medalla activa existente; no se puede abrir otra solicitud paralela.',
    );
  }
}
