import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  BarMissionMedalVersionStatus,
  Prisma,
  SubscriptionPlan,
} from '@prisma/client';
import { assertNoOtherActiveOfficialMedalForBar } from './bar-mission-medal-bar-official.util';
import { evaluateLegendMedalOperational } from './bar-mission-medal-legend-operational.util';
import { appendModerationAuditEvent } from './bar-mission-medal-moderation-audit.util';

export function assertSeasonEligibleForMedalActivation(
  startsAt: Date,
  endsAt: Date,
  now: Date = new Date(),
): void {
  if (endsAt < now) {
    throw new BadRequestException('SEASON_ENDED: la temporada ya finalizó; no se puede activar la medalla.');
  }
  if (startsAt > now) {
    throw new BadRequestException(
      'SEASON_NOT_STARTED: la temporada aún no inicia; programa la activación cuando comience el periodo.',
    );
  }
}

export async function activateApprovedMedalVersionInTx(
  tx: Prisma.TransactionClient,
  params: {
    versionId: string;
    adminId: string;
    subscription: {
      plan: SubscriptionPlan;
      status: string;
      trialEndsAt: Date | null;
      currentPeriodEnd: Date | null;
      canceledAt: Date | null;
      qrEnabled: boolean;
      promoEnabled: boolean;
    } | null;
    season: { id: string; barId: string; startsAt: Date; endsAt: Date };
    designConfig: Prisma.InputJsonValue | Prisma.JsonValue | null;
    auditAction: 'ACTIVATED' | 'APPROVE_AND_ACTIVATE';
  },
) {
  const legend = evaluateLegendMedalOperational(
    params.subscription as Parameters<typeof evaluateLegendMedalOperational>[0],
  );
  if (!legend.operational) {
    throw new BadRequestException(
      legend.suspensionMessage ?? 'Suscripción Legend no vigente para activar la medalla.',
    );
  }
  assertSeasonEligibleForMedalActivation(params.season.startsAt, params.season.endsAt);

  await assertNoOtherActiveOfficialMedalForBar(
    tx,
    params.season.barId,
    params.versionId,
    params.season.id,
  );

  const now = new Date();
  await tx.barMissionMedalVersion.updateMany({
    where: {
      seasonId: params.season.id,
      status: BarMissionMedalVersionStatus.ACTIVE,
      id: { not: params.versionId },
    },
    data: {
      status: BarMissionMedalVersionStatus.DISABLED,
      disabledAt: now,
    },
  });

  const auditDesign = appendModerationAuditEvent(params.designConfig, {
    action: params.auditAction,
    adminId: params.adminId,
  });

  const active = await tx.barMissionMedalVersion.update({
    where: { id: params.versionId },
    data: {
      status: BarMissionMedalVersionStatus.ACTIVE,
      activatedAt: now,
      approvedAt: now,
      moderatedByAdminId: params.adminId,
      moderatedAt: now,
      designConfig: auditDesign,
    },
    include: { conditions: { orderBy: { position: 'asc' } } },
  });

  await tx.barMissionSeason.update({
    where: { id: params.season.id },
    data: {
      currentMedalVersionId: active.id,
      medalTitle: active.title,
      medalDescription: active.description,
    },
  });

  return active;
}

export async function loadVersionForActivation(
  tx: Prisma.TransactionClient,
  versionId: string,
) {
  const version = await tx.barMissionMedalVersion.findUnique({
    where: { id: versionId },
    include: {
      conditions: { orderBy: { position: 'asc' } },
      season: {
        select: {
          id: true,
          barId: true,
          startsAt: true,
          endsAt: true,
          bar: {
            select: {
              subscription: true,
            },
          },
        },
      },
    },
  });
  if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');
  return version;
}
