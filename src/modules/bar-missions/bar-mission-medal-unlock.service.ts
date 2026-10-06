import { Injectable, Logger } from '@nestjs/common';
import {
  BarMissionMedalVersionStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

/** sourceType estable en GamificationReward (String, no enum Prisma). */
export const BAR_MEDAL_UNLOCK_SOURCE = 'BAR_MEDAL_UNLOCK';

export type MedalUnlockStatus =
  | 'UNLOCKED'
  | 'ALREADY_UNLOCKED'
  | 'VERSION_NOT_ACTIVE'
  | 'NOT_ELIGIBLE';

export type MedalUnlockResult = {
  status: MedalUnlockStatus;
  userBarMedalId: string | null;
  medalVersionId: string | null;
  xpAwarded: number;
};

const USER_XP_SELECT = {
  id: true,
  coins: true,
  loginStreakDays: true,
  lastLoginEpochDay: true,
  streakBonusTierClaimed: true,
  dailyChestClaimedDay: true,
  totalXp: true,
  level: true,
} as const;

/**
 * Desbloqueo definitivo FASE 6:
 * UserBarMedal + XP ledger + Notification (TX) → FCM post-commit.
 */
@Injectable()
export class BarMissionMedalUnlockService {
  private readonly logger = new Logger(BarMissionMedalUnlockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  async unlock(
    userId: string,
    seasonId: string,
    medalVersionId: string,
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

    type TxOk = {
      status: MedalUnlockStatus;
      userBarMedalId: string | null;
      medalVersionId: string | null;
      xpAwarded: number;
      notification: {
        type: NotificationType;
        title: string;
        body: string | null;
        payload: Prisma.JsonValue | null;
      } | null;
      barId: string;
    };

    let txResult: TxOk;
    try {
      txResult = await this.prisma.$transaction(async (tx) => {
        const again = await tx.userBarMedal.findUnique({
          where: { userId_seasonId: { userId, seasonId } },
          select: { id: true, medalVersionId: true },
        });
        if (again) {
          return {
            status: 'ALREADY_UNLOCKED' as const,
            userBarMedalId: again.id,
            medalVersionId: again.medalVersionId,
            xpAwarded: 0,
            notification: null,
            barId,
          };
        }

        // Revalidar ACTIVE dentro de la TX (race admin activate/disable).
        const version = await tx.barMissionMedalVersion.findFirst({
          where: {
            id: medalVersionId,
            seasonId,
            status: BarMissionMedalVersionStatus.ACTIVE,
          },
          include: {
            season: {
              select: {
                id: true,
                barId: true,
                bar: { select: { businessName: true } },
              },
            },
          },
        });
        if (!version || version.season.barId !== barId) {
          return {
            status: 'VERSION_NOT_ACTIVE' as const,
            userBarMedalId: null,
            medalVersionId: null,
            xpAwarded: 0,
            notification: null,
            barId,
          };
        }

        let medal: { id: string; medalVersionId: string | null };
        try {
          medal = await tx.userBarMedal.create({
            data: {
              userId,
              barId,
              seasonId,
              medalVersionId: version.id,
            },
            select: { id: true, medalVersionId: true },
          });
        } catch (e) {
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
          ) {
            const won = await tx.userBarMedal.findUnique({
              where: { userId_seasonId: { userId, seasonId } },
              select: { id: true, medalVersionId: true },
            });
            return {
              status: 'ALREADY_UNLOCKED' as const,
              userBarMedalId: won?.id ?? null,
              medalVersionId: won?.medalVersionId ?? null,
              xpAwarded: 0,
              notification: null,
              barId,
            };
          }
          throw e;
        }

        const xpReward = Math.max(0, version.xpReward);
        let xpAwarded = 0;
        if (xpReward > 0) {
          const user = await tx.user.findFirst({
            where: { id: userId, deletedAt: null },
            select: USER_XP_SELECT,
          });
          if (!user) {
            throw new Error('USER_NOT_FOUND_FOR_MEDAL_XP');
          }
          // Solo el ganador de UserBarMedal llega aquí; sourceId = medal.id.
          await this.users.grantRewardOnce(
            userId,
            user,
            {
              sourceType: BAR_MEDAL_UNLOCK_SOURCE,
              sourceId: medal.id,
              xp: xpReward,
              coins: 0,
            },
            tx,
          );
          xpAwarded = xpReward;
        }

        const barName = version.season.bar.businessName;
        const body =
          xpAwarded > 0
            ? `Conseguiste ${version.title} de ${barName}. +${xpAwarded} XP`
            : `Conseguiste ${version.title} de ${barName}.`;
        const dedupeKey = `bar-medal:${medal.id}`;
        const notification = await this.notifications.persistNotification(
          userId,
          NotificationType.SYSTEM,
          '¡Medalla desbloqueada!',
          body,
          {
            category: 'bar_medal',
            userBarMedalId: medal.id,
            medalVersionId: version.id,
            seasonId,
            barId,
            xpReward: xpAwarded,
            medalTitle: version.title,
          },
          { dedupeKey, tx },
        );

        return {
          status: 'UNLOCKED' as const,
          userBarMedalId: medal.id,
          medalVersionId: version.id,
          xpAwarded,
          notification,
          barId,
        };
      });
    } catch (err) {
      this.logger.error(
        JSON.stringify({
          event: 'bar_medal_unlock_failed',
          userId,
          barId,
          seasonId,
          medalVersionId,
          message: err instanceof Error ? err.message : 'unknown',
        }),
      );
      throw err;
    }

    if (txResult.status === 'UNLOCKED' && txResult.notification) {
      // FCM/realtime fuera de TX; fallo push no revierte medalla/XP.
      try {
        await this.notifications.deliverAfterPersist(userId, txResult.notification);
      } catch (err) {
        this.logger.warn(
          JSON.stringify({
            event: 'bar_medal_push_failed',
            userId,
            userBarMedalId: txResult.userBarMedalId,
            message: err instanceof Error ? err.message : 'unknown',
          }),
        );
      }
      this.logger.log(
        JSON.stringify({
          event: 'bar_medal_unlocked',
          userId,
          barId: txResult.barId,
          seasonId,
          medalVersionId: txResult.medalVersionId,
          userBarMedalId: txResult.userBarMedalId,
          xpAwarded: txResult.xpAwarded,
        }),
      );
    }

    return {
      status: txResult.status,
      userBarMedalId: txResult.userBarMedalId,
      medalVersionId: txResult.medalVersionId,
      xpAwarded: txResult.xpAwarded,
    };
  }
}
