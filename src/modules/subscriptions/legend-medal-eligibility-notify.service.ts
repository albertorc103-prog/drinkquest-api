import { Injectable, Logger } from '@nestjs/common';
import {
  BarMissionMedalVersionStatus,
  BarSubscription,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { notifyBarLegendMedalEvent } from '../bar-missions/bar-mission-medal-bar-notify.util';
import { evaluateLegendMedalOperational } from '../bar-missions/bar-mission-medal-legend-operational.util';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Notifica al BAR solo en transiciones reales de elegibilidad Legend (escritura de suscripción).
 * No se invoca en lecturas GET ni validaciones de desbloqueo.
 */
@Injectable()
export class LegendMedalEligibilityNotifyService {
  private readonly logger = new Logger(LegendMedalEligibilityNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async afterSubscriptionPersisted(
    barId: string,
    before: BarSubscription,
    after: BarSubscription,
  ): Promise<void> {
    const was = evaluateLegendMedalOperational(before);
    const now = evaluateLegendMedalOperational(after);
    if (was.operational === now.operational) return;

    const activeMedal = await this.prisma.barMissionMedalVersion.findFirst({
      where: {
        status: BarMissionMedalVersionStatus.ACTIVE,
        season: { barId, deletedAt: null },
      },
      select: { id: true },
      orderBy: { activatedAt: 'desc' },
    });
    if (!activeMedal) return;

    if (was.operational && !now.operational) {
      await notifyBarLegendMedalEvent(this.notifications, barId, 'subscription_suspended', {
        versionId: activeMedal.id,
        reason: now.suspensionMessage ?? undefined,
      });
      this.logger.log(
        JSON.stringify({
          event: 'legend_medal_subscription_suspended_notify',
          barId,
          medalVersionId: activeMedal.id,
        }),
      );
      return;
    }

    if (!was.operational && now.operational) {
      await notifyBarLegendMedalEvent(this.notifications, barId, 'subscription_reactivated', {
        versionId: activeMedal.id,
      });
      this.logger.log(
        JSON.stringify({
          event: 'legend_medal_subscription_reactivated_notify',
          barId,
          medalVersionId: activeMedal.id,
        }),
      );
    }
  }
}
