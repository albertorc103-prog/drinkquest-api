import { Injectable, Logger } from '@nestjs/common';
import { BarMissionSeasonStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BarMissionMedalProgressService } from './bar-mission-medal-progress.service';
import {
  BarMissionMedalUnlockService,
  MedalUnlockResult,
} from './bar-mission-medal-unlock.service';

export type MedalTriggerEventType = 'VISIT' | 'QR' | 'MISSION' | 'RESERVATION';

/**
 * Orquestación: eventos → season → motor → UnlockService definitivo.
 * No crea UserBarMedal / XP / notificaciones directamente.
 */
@Injectable()
export class BarMissionMedalActivityService {
  private readonly logger = new Logger(BarMissionMedalActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly medalProgress: BarMissionMedalProgressService,
    private readonly unlockService: BarMissionMedalUnlockService,
  ) {}

  async onVisitRegistered(
    userId: string,
    barId: string | null | undefined,
    occurredAt: Date = new Date(),
  ): Promise<void> {
    if (!barId) return;
    await this.safeTrigger('VISIT', userId, barId, occurredAt, async () => {
      const season = await this.resolveSeasonForBar(barId, occurredAt);
      if (!season) return;
      await this.evaluateAndMaybeUnlock(userId, season.id, barId);
    });
  }

  async onQrRedeemed(
    userId: string,
    barId: string,
    occurredAt: Date = new Date(),
    seasonId?: string,
  ): Promise<void> {
    await this.safeTrigger('QR', userId, barId, occurredAt, async () => {
      const seasonIdResolved =
        seasonId ?? (await this.resolveSeasonForBar(barId, occurredAt))?.id;
      if (!seasonIdResolved) return;
      await this.evaluateAndMaybeUnlock(userId, seasonIdResolved, barId);
    });
  }

  async onMissionProgress(
    userId: string,
    seasonId: string,
    barId: string,
    occurredAt: Date = new Date(),
  ): Promise<void> {
    await this.safeTrigger('MISSION', userId, barId, occurredAt, async () => {
      await this.evaluateAndMaybeUnlock(userId, seasonId, barId);
    }, seasonId);
  }

  async onReservationMissionProgress(
    userId: string,
    seasonId: string,
    barId: string,
    occurredAt: Date = new Date(),
  ): Promise<void> {
    await this.safeTrigger('RESERVATION', userId, barId, occurredAt, async () => {
      await this.evaluateAndMaybeUnlock(userId, seasonId, barId);
    }, seasonId);
  }

  /**
   * 1) existing medal → ALREADY_UNLOCKED
   * 2) ACTIVE + eligible → UnlockService
   * No crea medalla aquí.
   */
  async evaluateAndMaybeUnlock(
    userId: string,
    seasonId: string,
    barId: string,
  ): Promise<MedalUnlockResult> {
    const existing = await this.prisma.userBarMedal.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
      select: { id: true, medalVersionId: true },
    });
    if (existing) {
      return {
        status: 'ALREADY_UNLOCKED',
        userBarMedalId: existing.id,
        medalVersionId: existing.medalVersionId,
        xpAwarded: 0,
      };
    }

    const { eligible, activeVersion } = await this.medalProgress.isEligibleToUnlock(
      userId,
      seasonId,
    );
    if (!eligible || !activeVersion) {
      return {
        status: 'NOT_ELIGIBLE',
        userBarMedalId: null,
        medalVersionId: null,
        xpAwarded: 0,
      };
    }

    return this.unlockService.unlock(userId, seasonId, activeVersion.id, barId);
  }

  async resolveSeasonForBar(barId: string, occurredAt: Date) {
    const rows = await this.prisma.barMissionSeason.findMany({
      where: {
        barId,
        deletedAt: null,
        status: BarMissionSeasonStatus.ACTIVE,
        startsAt: { lte: occurredAt },
        endsAt: { gte: occurredAt },
      },
      select: { id: true, barId: true, startsAt: true, endsAt: true },
      take: 2,
    });
    if (rows.length === 0) return null;
    if (rows.length > 1) {
      this.logger.error(
        JSON.stringify({
          event: 'bar_medal_season_ambiguous',
          barId,
          seasonIds: rows.map((r) => r.id),
        }),
      );
      return null;
    }
    return rows[0];
  }

  private async safeTrigger(
    eventType: MedalTriggerEventType,
    userId: string,
    barId: string,
    _occurredAt: Date,
    fn: () => Promise<void>,
    seasonId?: string,
  ) {
    try {
      await fn();
    } catch (err) {
      this.logger.error(
        JSON.stringify({
          event: 'bar_medal_trigger_failed',
          eventType,
          userId,
          barId,
          seasonId: seasonId ?? null,
          message: err instanceof Error ? err.message : 'unknown',
        }),
      );
    }
  }
}
