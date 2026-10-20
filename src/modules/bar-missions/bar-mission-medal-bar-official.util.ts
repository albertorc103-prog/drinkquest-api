import { ConflictException } from '@nestjs/common';
import {
  BarMissionMedalVersionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** Bloquea fila del bar para activaciones concurrentes de medalla oficial. */
export async function lockBarRowForOfficialMedalActivation(
  tx: Prisma.TransactionClient,
  barId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT id FROM bars WHERE id = ${barId}::uuid FOR UPDATE`;
}

/**
 * Máximo una medalla oficial ACTIVE por establecimiento (todas las temporadas).
 * No desactiva medallas existentes: solo impide activar otra en temporada distinta.
 * La sustitución v1→v2 en la misma temporada sigue en activate() vía updateMany.
 */
export async function assertNoOtherActiveOfficialMedalForBar(
  tx: Prisma.TransactionClient,
  barId: string,
  activatingVersionId: string,
  activatingSeasonId: string,
): Promise<void> {
  await lockBarRowForOfficialMedalActivation(tx, barId);

  const other = await tx.barMissionMedalVersion.findFirst({
    where: {
      status: BarMissionMedalVersionStatus.ACTIVE,
      id: { not: activatingVersionId },
      season: {
        barId,
        deletedAt: null,
        id: { not: activatingSeasonId },
      },
    },
    select: { id: true, seasonId: true, version: true },
  });
  if (other) {
    throw new ConflictException(
      'BAR_OFFICIAL_MEDAL_ALREADY_ACTIVE: este establecimiento ya tiene una medalla oficial activa. Desactívala antes de activar otra.',
    );
  }
}

/** Barras con más de una versión ACTIVE (incumplen la regla); solo lectura / reporte. */
export async function findBarsViolatingSingleActiveOfficialMedal(
  prisma: PrismaService | Prisma.TransactionClient,
) {
  const rows = await prisma.barMissionMedalVersion.findMany({
    where: {
      status: BarMissionMedalVersionStatus.ACTIVE,
      season: { deletedAt: null },
    },
    select: {
      id: true,
      seasonId: true,
      season: { select: { barId: true } },
    },
  });
  const byBar = new Map<string, Array<{ versionId: string; seasonId: string }>>();
  for (const row of rows) {
    const barId = row.season.barId;
    const list = byBar.get(barId) ?? [];
    list.push({ versionId: row.id, seasonId: row.seasonId });
    byBar.set(barId, list);
  }
  return [...byBar.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([barId, items]) => ({
      barId,
      activeMedalCount: items.length,
      medals: items,
    }));
}
