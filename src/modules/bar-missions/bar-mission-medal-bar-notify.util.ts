import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

const DEDUPE_PREFIX = 'legend-medal-bar:';

export async function notifyBarLegendMedalEvent(
  notifications: NotificationsService,
  barId: string,
  kind:
    | 'correction_required'
    | 'approved_activated'
    | 'subscription_suspended'
    | 'subscription_reactivated',
  detail: { versionId: string; reason?: string },
): Promise<void> {
  const dedupeKey = `${DEDUPE_PREFIX}${kind}:${detail.versionId}`;
  let title: string;
  let body: string | undefined;
  switch (kind) {
    case 'correction_required':
      title = 'Corrección requerida en tu medalla Legend';
      body = detail.reason?.trim()
        ? detail.reason.trim().slice(0, 500)
        : 'Revisa los comentarios del equipo y reenvía tu solicitud.';
      break;
    case 'approved_activated':
      title = 'Medalla Legend aprobada y activa';
      body = 'Tu medalla oficial ya está disponible para que los usuarios la desbloqueen.';
      break;
    case 'subscription_suspended':
      title = 'Medalla Legend suspendida';
      body =
        detail.reason ??
        'Tu suscripción Legend no está vigente. No habrá nuevos desbloqueos hasta renovar.';
      break;
    case 'subscription_reactivated':
      title = 'Medalla Legend reactivada';
      body = 'Recuperaste tu suscripción Legend. Tu medalla oficial vuelve a estar disponible.';
      break;
  }
  await notifications.notifyBarOwner(
    barId,
    NotificationType.SYSTEM,
    title,
    body,
    {
      category: 'legend_medal',
      kind,
      medalVersionId: detail.versionId,
      dedupeKey,
    },
  );
}
