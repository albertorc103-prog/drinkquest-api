import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  BarMissionMedalVersion,
  BarMissionMedalVersionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type ActiveMedalVersionWithConditions = BarMissionMedalVersion & {
  conditions: Array<{
    id: string;
    type: import('@prisma/client').BarMissionMedalConditionType;
    targetValue: number | null;
    referenceId: string | null;
    position: number;
  }>;
};

/**
 * Resolver único: versión desbloqueable = status ACTIVE.
 * Nunca usar currentMedalVersionId para unlock.
 */
@Injectable()
export class BarMissionMedalActiveResolver {
  private readonly logger = new Logger(BarMissionMedalActiveResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  async findActiveMedalVersionForSeason(
    seasonId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ActiveMedalVersionWithConditions | null> {
    const db = tx ?? this.prisma;
    const rows = await db.barMissionMedalVersion.findMany({
      where: {
        seasonId,
        status: BarMissionMedalVersionStatus.ACTIVE,
      },
      include: { conditions: { orderBy: { position: 'asc' } } },
      orderBy: { version: 'desc' },
      take: 2,
    });
    if (rows.length === 0) return null;
    if (rows.length > 1) {
      this.logger.error(
        `Corrupt data: ${rows.length} ACTIVE medal versions for season ${seasonId}`,
      );
      throw new ConflictException(
        'MEDAL_ACTIVE_AMBIGUOUS: más de una versión ACTIVE para la temporada.',
      );
    }
    return rows[0];
  }

  /**
   * Medalla ACTIVE del establecimiento (mapa / ficha pública).
   * Si no hay temporada ACTIVE en ventana, aún puede existir una versión ACTIVE en otra temporada.
   */
  async findActiveMedalVersionForBar(
    barId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ version: ActiveMedalVersionWithConditions; seasonId: string } | null> {
    const db = tx ?? this.prisma;
    const rows = await db.barMissionMedalVersion.findMany({
      where: {
        status: BarMissionMedalVersionStatus.ACTIVE,
        season: { barId, deletedAt: null },
      },
      include: {
        conditions: { orderBy: { position: 'asc' } },
        season: { select: { id: true, startsAt: true } },
      },
      orderBy: [{ season: { startsAt: 'desc' } }, { version: 'desc' }],
      take: 2,
    });
    if (rows.length === 0) return null;
    if (rows.length > 1) {
      this.logger.warn(
        `Bar ${barId} has ${rows.length} ACTIVE medal versions across seasons; using newest season.`,
      );
    }
    const row = rows[0];
    const { season, conditions, ...version } = row;
    return {
      seasonId: season.id,
      version: { ...version, conditions },
    };
  }
}
