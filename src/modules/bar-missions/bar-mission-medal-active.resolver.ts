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
}
