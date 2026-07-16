import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
  QrSessionStatus,
  SpecialDrinkApprovalStatus,
  SpecialDrinkStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { randomToken, sha256 } from '../../common/utils/crypto.util';
import { NotificationsService } from '../notifications/notifications.service';
import { MissionsService } from '../missions/missions.service';
import { BarMissionsService } from '../bar-missions/bar-missions.service';
import { GlobalEventsService } from '../global-events/global-events.service';
import { BarAccessService } from '../subscriptions/bar-access.service';

export interface QrPayloadResponse {
  sessionId: string;
  businessId: string;
  drinkId: string;
  drinkName: string;
  timestamp: number;
  expiresAt: number;
  token: string;
  isSpecial?: boolean;
  specialDrinkId?: string | null;
  isLimitedEdition?: boolean;
  venueLabel?: string | null;
}

@Injectable()
export class QrService {
  private readonly logger = new Logger(QrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly missions: MissionsService,
    private readonly barMissions: BarMissionsService,
    private readonly globalEvents: GlobalEventsService,
    private readonly barAccess: BarAccessService,
  ) {}

  async createSession(
    barOwnerId: string,
    opts: { drinkId?: string; legacyDrinkId?: number; specialDrinkId?: string },
  ): Promise<QrPayloadResponse> {
    const { bar } = await this.barAccess.assertOwnerCanGenerateQr(barOwnerId);

    let drink =
      opts.specialDrinkId != null
        ? await this.resolveSpecialDrink(bar.id, opts.specialDrinkId)
        : opts.drinkId
          ? await this.prisma.drink.findFirst({ where: { id: opts.drinkId, deletedAt: null } })
          : await this.prisma.drink.findFirst({
              where: { legacyId: opts.legacyDrinkId, deletedAt: null },
            });
    if (!drink) throw new NotFoundException('Bebida no encontrada');
    const drinkId = drink.id;
    const isSpecial = !!drink.sourceSpecialDrinkId;

    const menuItem = await this.prisma.barMenuItem.findFirst({
      where: { barId: bar.id, drinkId, active: true, deletedAt: null },
      include: { drink: true },
    });
    if (!menuItem) throw new BadRequestException('Bebida no autorizada en este bar');

    const ttlMin = this.config.get<number>('app.qrSessionTtlMinutes', 10);
    const now = Date.now();
    const expiresAt = new Date(now + ttlMin * 60_000);
    const token = randomToken(24);

    const session = await this.prisma.qrSession.create({
      data: {
        barId: bar.id,
        drinkId,
        tokenHash: sha256(token),
        expiresAt,
        status: QrSessionStatus.ACTIVE,
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'qr_generate',
        ownerUserId: barOwnerId,
        barId: bar.id,
        sessionId: session.id,
        drinkId,
        isSpecial,
        specialDrinkId: drink.sourceSpecialDrinkId,
      }),
    );

    return {
      sessionId: session.id,
      businessId: bar.id,
      drinkId,
      drinkName: menuItem.drink.name,
      timestamp: now,
      expiresAt: expiresAt.getTime(),
      token,
      isSpecial,
      specialDrinkId: drink.sourceSpecialDrinkId,
      isLimitedEdition: isSpecial,
      venueLabel: isSpecial ? bar.businessName : null,
    };
  }

  private async resolveSpecialDrink(barId: string, specialDrinkId: string) {
    const special = await this.prisma.barSpecialDrink.findFirst({
      where: {
        id: specialDrinkId,
        barId,
        deletedAt: null,
        approvalStatus: SpecialDrinkApprovalStatus.APPROVED,
        status: SpecialDrinkStatus.ACTIVE,
      },
    });
    if (!special) {
      throw new BadRequestException(
        'Bebida especializada no disponible. Debe estar aprobada y activa.',
      );
    }
    const drink = await this.prisma.drink.findFirst({
      where: { sourceSpecialDrinkId: special.id, deletedAt: null },
    });
    if (!drink) {
      throw new BadRequestException(
        'La bebida especializada aún no está lista para QR. Contacta a soporte.',
      );
    }
    return drink;
  }

  async redeem(
    userId: string,
    payload: Pick<QrPayloadResponse, 'sessionId' | 'businessId' | 'drinkId' | 'token' | 'expiresAt'>,
  ) {
    if (Date.now() > payload.expiresAt) {
      await this.markExpired(payload.sessionId);
      throw new BadRequestException('Código QR expirado');
    }

    const session = await this.prisma.qrSession.findUnique({
      where: { id: payload.sessionId },
      include: { bar: true, drink: true },
    });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    if (session.barId !== payload.businessId || session.drinkId !== payload.drinkId) {
      throw new BadRequestException('Payload inválido');
    }
    if (session.tokenHash !== sha256(payload.token)) {
      throw new BadRequestException('Token de seguridad inválido');
    }
    if (session.status === QrSessionStatus.USED) {
      throw new BadRequestException('Este código ya fue utilizado');
    }
    if (session.status === QrSessionStatus.EXPIRED || session.expiresAt < new Date()) {
      throw new BadRequestException('Código QR expirado');
    }

    const menuOk = await this.prisma.barMenuItem.findFirst({
      where: { barId: session.barId, drinkId: session.drinkId, active: true, deletedAt: null },
    });
    if (!menuOk) throw new BadRequestException('Bebida no autorizada');

    const existing = await this.prisma.userDrinkUnlock.findUnique({
      where: { userId_drinkId: { userId, drinkId: session.drinkId } },
    });
    if (existing) throw new BadRequestException('Ya desbloqueaste esta bebida');

    const xp = session.drink.xpReward;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.qrSession.update({
        where: { id: session.id },
        data: { status: QrSessionStatus.USED, scannedById: userId, usedAt: new Date() },
      });
      await tx.userDrinkUnlock.create({
        data: { userId, drinkId: session.drinkId, barId: session.barId, xpEarned: xp },
      });
      await tx.drinkHistoryEntry.create({
        data: { userId, drinkId: session.drinkId, barId: session.barId },
      });
      return tx.user.update({
        where: { id: userId },
        data: { totalXp: { increment: xp } },
      });
    });

    await this.missions.onQrUnlock(userId);
    await this.barMissions.onQrUnlock(userId, session.barId);
    await this.globalEvents.onQrUnlock(userId, session.barId);
    await this.notifications.create(
      userId,
      NotificationType.QR_UNLOCK,
      '¡Bebida desbloqueada!',
      session.drink.name,
      { drinkId: session.drinkId, barId: session.barId },
    );

    this.logger.log(
      JSON.stringify({
        event: 'qr_redeem',
        userId,
        sessionId: session.id,
        barId: session.barId,
        drinkId: session.drinkId,
      }),
    );

    return {
      drinkId: session.drinkId,
      legacyDrinkId: session.drink.legacyId,
      drinkName: session.drink.name,
      businessId: session.barId,
      businessName: session.bar.businessName,
      xpEarned: xp,
      rarity: session.drink.rarity,
      totalXp: result.totalXp,
      isSpecial: !!session.drink.sourceSpecialDrinkId,
      specialDrinkId: session.drink.sourceSpecialDrinkId,
      isLimitedEdition: !!session.drink.sourceSpecialDrinkId,
      venueLabel: session.drink.sourceSpecialDrinkId
        ? session.bar.businessName
        : null,
      venueLogoUrl: session.drink.sourceSpecialDrinkId
        ? (session.bar.logoUrl ?? null)
        : null,
      venueBannerUrl: session.drink.sourceSpecialDrinkId
        ? (session.bar.bannerUrl ?? null)
        : null,
      venueImageUrl: session.drink.sourceSpecialDrinkId
        ? (session.bar.bannerUrl ?? session.bar.logoUrl ?? null)
        : null,
      funFact: session.drink.sourceSpecialDrinkId ? session.drink.description : null,
      recipe: session.drink.sourceSpecialDrinkId ? session.drink.ingredients : null,
    };
  }

  async history(barId: string, limit = 50) {
    return this.prisma.qrSession.findMany({
      where: { barId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { drink: { select: { name: true } }, scannedBy: { select: { displayName: true } } },
    });
  }

  async analytics(barId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const used = await this.prisma.qrSession.findMany({
      where: { barId, status: QrSessionStatus.USED },
      include: { drink: true },
      orderBy: { usedAt: 'asc' },
    });

    const today = used.filter((s) => s.usedAt && s.usedAt >= startOfDay);
    const counts = new Map<string, number>();
    for (const s of used) {
      counts.set(s.drink.name, (counts.get(s.drink.name) ?? 0) + 1);
    }
    const topEntries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = topEntries[0];
    const uniqueUsers = new Set(used.map((s) => s.scannedById).filter(Boolean)).size;

    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayKey = dayKey(new Date());

    const weeklyActivity = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (6 - i));
      const key = dayKey(d);
      return used.filter((s) => s.usedAt && dayKey(s.usedAt) === key).length;
    });

    const peakHours = Array.from({ length: 24 }, () => 0);
    for (const s of used) {
      if (!s.usedAt) continue;
      peakHours[s.usedAt.getHours()] += 1;
    }

    const firstSeen = new Map<string, Date>();
    for (const s of used) {
      const uid = s.scannedById;
      if (!uid || !s.usedAt) continue;
      const prev = firstSeen.get(uid);
      if (!prev || s.usedAt < prev) firstSeen.set(uid, s.usedAt);
    }
    let newUsers = 0;
    for (const firstAt of firstSeen.values()) {
      if (dayKey(firstAt) === todayKey) newUsers += 1;
    }
    const returningUsers = Math.max(0, uniqueUsers - newUsers);

    return {
      unlocksToday: today.length,
      mostPopularDrink: top?.[0] ?? '—',
      uniqueUsers,
      totalScans: used.length,
      weeklyActivity,
      topDrinks: topEntries.slice(0, 8).map(([name, count]) => ({ name, count })),
      peakHours,
      newUsers,
      returningUsers,
    };
  }

  private async markExpired(sessionId: string) {
    await this.prisma.qrSession.updateMany({
      where: { id: sessionId, status: QrSessionStatus.ACTIVE },
      data: { status: QrSessionStatus.EXPIRED },
    });
  }
}
