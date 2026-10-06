import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  Bar,
  BarSubscription,
  PlaceVisit,
  PlaceVisitRewardTier,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { assertAgeGateForSensitiveAction } from '../../common/utils/age-gate.util';
import { evaluateSubscriptionActive } from '../subscriptions/bar-access.rules';
import { CheckInPlaceDto } from './dto/check-in-place.dto';
import {
  MyVisitedPlaceDto,
  MyVisitedPlacesResponseDto,
  PlaceCheckInResponseDto,
} from './dto/place-visit-response.dto';
import { ExternalPlaceService } from './external-place.service';
import { PLACE_VISIT_CONFIG } from './place-visit.config';
import { calendarDateInTimeZone, haversineMeters } from './place-visit.geo';
import { collectionKey } from './place-visit.identity';
import { validateCheckInLocationFix } from './place-visit.location';
import { levelFromTotalXp, xpForVisit } from './place-visit.rewards';
import { BarMissionMedalActivityService } from '../bar-missions/bar-mission-medal-activity.service';

type BarWithSub = Bar & { subscription: BarSubscription | null };

type ResolvedTarget = {
  bar: BarWithSub | null;
  externalPlaceId: string | null;
  googlePlaceId: string | null;
  placeLat: number;
  placeLng: number;
  radiusMeters: number;
  drinkQuestPartner: boolean;
  rewardTier: PlaceVisitRewardTier;
};

@Injectable()
export class PlaceVisitsService {
  private readonly logger = new Logger(PlaceVisitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalPlaces: ExternalPlaceService,
    private readonly medalActivity: BarMissionMedalActivityService,
  ) {}

  async checkIn(
    userId: string,
    dto: CheckInPlaceDto,
    now: Date = new Date(),
  ): Promise<PlaceCheckInResponseDto> {
    const actor = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        role: true,
        ageVerifiedAt: true,
        createdAt: true,
      },
    });
    if (!actor) {
      return this.fail('FORBIDDEN', 'Usuario no autorizado.');
    }
    try {
      assertAgeGateForSensitiveAction(actor);
    } catch (err) {
      if (err instanceof ForbiddenException) {
        return this.fail(
          'FORBIDDEN',
          'Tu cuenta no tiene verificación de mayoría de edad.',
        );
      }
      throw err;
    }

    const barId = dto.barId?.trim() || undefined;
    const googlePlaceId = dto.googlePlaceId?.trim() || undefined;

    if (!barId && !googlePlaceId) {
      return this.fail('BAD_REQUEST', 'Se requiere barId o googlePlaceId.');
    }

    const fix = validateCheckInLocationFix(
      {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        capturedAtMs: dto.capturedAtMs,
      },
      now,
    );
    if (!fix.ok) {
      const status =
        fix.code === 'LOCATION_TOO_INACCURATE'
          ? 'INACCURATE'
          : fix.code === 'LOCATION_STALE' || fix.code === 'LOCATION_FUTURE'
            ? 'LOCATION_STALE'
            : 'LOCATION_INVALID';
      return this.fail(status, fix.message);
    }

    let target: ResolvedTarget;
    try {
      target = await this.resolveTarget({ barId, googlePlaceId }, now);
    } catch (err) {
      if (err instanceof BadRequestException) {
        const msg =
          typeof err.message === 'string' ? err.message : 'Lugar no encontrado.';
        if (msg.includes('coordenadas')) {
          return this.fail('PLACE_COORDS_UNAVAILABLE', msg);
        }
        return this.fail('PLACE_NOT_FOUND', msg);
      }
      throw err;
    }

    // Distancia SIEMPRE en servidor (ignorar cualquier distance del cliente).
    const distanceMeters = haversineMeters(
      dto.latitude,
      dto.longitude,
      target.placeLat,
      target.placeLng,
    );
    if (distanceMeters > target.radiusMeters) {
      return this.fail('OUT_OF_RANGE', 'Estás fuera del radio de check-in.', {
        distanceMeters,
        barId: target.bar?.id ?? null,
        externalPlaceId: target.externalPlaceId,
        googlePlaceId: target.googlePlaceId,
        drinkQuestPartner: target.drinkQuestPartner,
      });
    }

    const visitDate = calendarDateInTimeZone(
      now,
      PLACE_VISIT_CONFIG.VISIT_CALENDAR_TIMEZONE,
    );

    const prior = await this.findPriorVisits(
      userId,
      target.googlePlaceId,
      target.bar?.id ?? null,
    );

    if (prior.some((v) => sameDate(v.visitDate, visitDate))) {
      return this.fail('ALREADY_VISITED_TODAY', 'Ya registraste este lugar hoy.', {
        xpAwarded: 0,
        firstVisit: false,
        distanceMeters,
        barId: target.bar?.id ?? null,
        externalPlaceId: target.externalPlaceId,
        googlePlaceId: target.googlePlaceId,
        drinkQuestPartner: target.drinkQuestPartner,
        rewardTier: target.rewardTier,
      });
    }

    const last = prior[0];
    if (last) {
      const hours =
        (now.getTime() - last.visitedAt.getTime()) / (1000 * 60 * 60);
      if (hours < PLACE_VISIT_CONFIG.MIN_CHECK_IN_INTERVAL_HOURS) {
        return this.fail(
          'TOO_SOON',
          `Debes esperar ${PLACE_VISIT_CONFIG.MIN_CHECK_IN_INTERVAL_HOURS} h entre visitas.`,
          {
            xpAwarded: 0,
            firstVisit: false,
            distanceMeters,
            barId: target.bar?.id ?? null,
            externalPlaceId: target.externalPlaceId,
            googlePlaceId: target.googlePlaceId,
            drinkQuestPartner: target.drinkQuestPartner,
            rewardTier: target.rewardTier,
          },
        );
      }
    }

    const firstVisit = prior.length === 0;
    // XP SIEMPRE en servidor.
    const xpAwarded = xpForVisit(target.rewardTier, firstVisit);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findFirst({
          where: { id: userId, deletedAt: null },
          select: { totalXp: true, level: true },
        });
        if (!user) {
          throw new ForbiddenException('Usuario no autorizado.');
        }
        const totalXp = user.totalXp + xpAwarded;
        const level = levelFromTotalXp(totalXp);

        const visit = await tx.placeVisit.create({
          data: {
            userId,
            barId: target.bar?.id ?? null,
            externalPlaceId: target.externalPlaceId,
            googlePlaceId: target.googlePlaceId,
            visitDate,
            visitedAt: now,
            // FASE 3 minimización: no persistir coords exactas del usuario.
            latitude: null,
            longitude: null,
            accuracy: null,
            distanceMeters,
            xpAwarded,
            firstVisit,
            rewardTier: target.rewardTier,
          },
        });

        await tx.user.update({
          where: { id: userId },
          data: { totalXp, level },
        });

        return { visit, totalXp, level };
      });

      this.logger.log(
        JSON.stringify({
          event: 'place_check_in',
          status: firstVisit ? 'FIRST_VISIT' : 'RETURN_VISIT',
          visitId: result.visit.id,
          userIdHash: userId.slice(0, 8),
          xpAwarded,
          // Sin lat/lng exactas del usuario.
          distanceBucketM: Math.round(distanceMeters / 10) * 10,
          accuracyOk: true,
        }),
      );

      // Hook secundario post-commit: barId null (POI externo) → no-op.
      await this.medalActivity.onVisitRegistered(
        userId,
        target.bar?.id ?? null,
        now,
      );

      return {
        status: firstVisit ? 'FIRST_VISIT' : 'RETURN_VISIT',
        visitId: result.visit.id,
        xpAwarded,
        firstVisit,
        rewardTier: target.rewardTier,
        distanceMeters,
        totalXp: result.totalXp,
        level: result.level,
        barId: target.bar?.id ?? null,
        externalPlaceId: target.externalPlaceId,
        googlePlaceId: target.googlePlaceId,
        drinkQuestPartner: target.drinkQuestPartner,
      };
    } catch (err) {
      if (err instanceof ForbiddenException) {
        return this.fail('FORBIDDEN', 'Usuario no autorizado.');
      }
      if (isUniqueViolation(err)) {
        return this.fail('ALREADY_VISITED_TODAY', 'Ya registraste este lugar hoy.', {
          xpAwarded: 0,
          firstVisit: false,
          distanceMeters,
          barId: target.bar?.id ?? null,
          externalPlaceId: target.externalPlaceId,
          googlePlaceId: target.googlePlaceId,
          drinkQuestPartner: target.drinkQuestPartner,
          rewardTier: target.rewardTier,
        });
      }
      this.logger.error(
        JSON.stringify({
          event: 'place_check_in_failed',
          // Sin coords del usuario en logs de error.
          message: err instanceof Error ? err.message : 'unknown',
        }),
      );
      throw err;
    }
  }

  async listMyVisitedPlaces(userId: string): Promise<MyVisitedPlacesResponseDto> {
    const visits = await this.prisma.placeVisit.findMany({
      where: { userId },
      orderBy: { visitedAt: 'asc' },
      include: {
        bar: {
          select: {
            id: true,
            businessName: true,
            logoUrl: true,
            city: true,
            googlePlaceId: true,
            subscription: {
              select: {
                status: true,
                trialEndsAt: true,
                currentPeriodEnd: true,
                canceledAt: true,
                qrEnabled: true,
                promoEnabled: true,
              },
            },
          },
        },
        externalPlace: true,
      },
    });

    const map = new Map<
      string,
      MyVisitedPlaceDto & { _first: Date; _last: Date; _xp: number }
    >();

    for (const v of visits) {
      const key = collectionKey({
        googlePlaceId: v.googlePlaceId,
        barId: v.barId,
      });
      if (!key) continue;

      const existing = map.get(key);
      if (existing) {
        existing.visitCount += 1;
        existing._xp += v.xpAwarded;
        if (v.visitedAt < existing._first) existing._first = v.visitedAt;
        if (v.visitedAt > existing._last) existing._last = v.visitedAt;
        // Preferir barId/external más recientes si aparecen.
        if (v.barId) existing.barId = v.barId;
        if (v.externalPlaceId) existing.externalPlaceId = v.externalPlaceId;
        if (v.googlePlaceId) existing.googlePlaceId = v.googlePlaceId;
        continue;
      }

      const partner = v.bar
        ? evaluateSubscriptionActive(v.bar.subscription).allowed
        : false;

      // Si hay googlePlaceId, buscar Bar actual por esa identidad (puede no estar en esta fila).
      map.set(key, {
        collectionKey: key,
        barId: v.barId,
        externalPlaceId: v.externalPlaceId,
        googlePlaceId: v.googlePlaceId,
        name:
          v.bar?.businessName ??
          v.externalPlace?.name ??
          'Lugar descubierto',
        visitCount: 1,
        firstVisitAt: v.visitedAt.toISOString(),
        lastVisitAt: v.visitedAt.toISOString(),
        drinkQuestPartner: partner,
        primaryType: v.externalPlace?.primaryType ?? null,
        city: v.bar?.city ?? v.externalPlace?.city ?? null,
        logoUrl: v.bar?.logoUrl ?? null,
        totalXpAwarded: v.xpAwarded,
        _first: v.visitedAt,
        _last: v.visitedAt,
        _xp: v.xpAwarded,
      });
    }

    // Enriquecer con Bar actual por googlePlaceId (transición External → Bar).
    const googleIds = [...map.values()]
      .map((i) => i.googlePlaceId)
      .filter((g): g is string => Boolean(g));
    if (googleIds.length > 0) {
      const bars = await this.prisma.bar.findMany({
        where: {
          googlePlaceId: { in: googleIds },
          deletedAt: null,
        },
        select: {
          id: true,
          businessName: true,
          logoUrl: true,
          city: true,
          googlePlaceId: true,
          subscription: {
            select: {
              status: true,
              trialEndsAt: true,
              currentPeriodEnd: true,
              canceledAt: true,
              qrEnabled: true,
              promoEnabled: true,
            },
          },
        },
      });
      const byGoogle = new Map(bars.map((b) => [b.googlePlaceId!, b]));
      for (const item of map.values()) {
        if (!item.googlePlaceId) continue;
        const bar = byGoogle.get(item.googlePlaceId);
        if (!bar) continue;
        item.barId = bar.id;
        item.name = bar.businessName;
        item.logoUrl = bar.logoUrl;
        item.city = bar.city ?? item.city;
        item.drinkQuestPartner = evaluateSubscriptionActive(bar.subscription).allowed;
      }
    }

    const items: MyVisitedPlaceDto[] = [...map.values()]
      .map(({ _first, _last, _xp, ...rest }) => ({
        ...rest,
        totalXpAwarded: _xp,
        firstVisitAt: _first.toISOString(),
        lastVisitAt: _last.toISOString(),
      }))
      .sort(
        (a, b) =>
          new Date(b.lastVisitAt).getTime() - new Date(a.lastVisitAt).getTime(),
      );

    return { items, total: items.length };
  }

  /**
   * Resuelve coords confiables + identidades.
   * Con googlePlaceId: siempre ExternalPlace + opcional Bar.
   * Solo barId sin google: no crea ExternalPlace.
   */
  private async resolveTarget(
    input: { barId?: string; googlePlaceId?: string },
    now: Date,
  ): Promise<ResolvedTarget> {
    if (input.googlePlaceId) {
      const external = await this.externalPlaces.resolveForCheckIn(
        input.googlePlaceId,
        now,
      );
      if (
        external.latitude == null ||
        external.longitude == null ||
        !Number.isFinite(external.latitude) ||
        !Number.isFinite(external.longitude)
      ) {
        throw new BadRequestException(
          'No hay coordenadas confiables para este Google Place.',
        );
      }

      let bar: BarWithSub | null = null;
      if (input.barId) {
        bar = await this.loadBar(input.barId);
        if (
          bar.googlePlaceId &&
          bar.googlePlaceId !== input.googlePlaceId
        ) {
          throw new BadRequestException(
            'barId no coincide con googlePlaceId.',
          );
        }
      } else {
        bar = await this.prisma.bar.findFirst({
          where: {
            googlePlaceId: input.googlePlaceId,
            deletedAt: null,
            isActive: true,
          },
          include: { subscription: true },
        });
      }

      const partner = bar
        ? evaluateSubscriptionActive(bar.subscription, now).allowed
        : false;

      // Si hay Bar con coords propias, preferirlas (datos DrinkQuest).
      let placeLat = external.latitude;
      let placeLng = external.longitude;
      let radiusMeters: number = PLACE_VISIT_CONFIG.CHECK_IN_RADIUS_METERS;
      if (
        bar?.latitude != null &&
        bar.longitude != null &&
        Number.isFinite(bar.latitude) &&
        Number.isFinite(bar.longitude)
      ) {
        placeLat = bar.latitude;
        placeLng = bar.longitude;
        radiusMeters =
          bar.checkInRadiusMeters ??
          PLACE_VISIT_CONFIG.CHECK_IN_RADIUS_METERS;
      }

      return {
        bar,
        externalPlaceId: external.id,
        googlePlaceId: input.googlePlaceId,
        placeLat,
        placeLng,
        radiusMeters,
        drinkQuestPartner: partner,
        rewardTier: partner
          ? PlaceVisitRewardTier.SUBSCRIBED
          : PlaceVisitRewardTier.STANDARD,
      };
    }

    // Solo barId (sin googlePlaceId en request).
    const bar = await this.loadBar(input.barId!);
    if (bar.latitude == null || bar.longitude == null) {
      throw new BadRequestException(
        'El establecimiento no tiene coordenadas configuradas.',
      );
    }

    const partner = evaluateSubscriptionActive(bar.subscription, now).allowed;

    // Si el Bar ya tiene googlePlaceId, asegurar ExternalPlace y denormalizar.
    if (bar.googlePlaceId) {
      const external = await this.externalPlaces.resolveForCheckIn(
        bar.googlePlaceId,
        now,
      );
      return {
        bar,
        externalPlaceId: external.id,
        googlePlaceId: bar.googlePlaceId,
        placeLat: bar.latitude,
        placeLng: bar.longitude,
        radiusMeters:
          bar.checkInRadiusMeters ??
          PLACE_VISIT_CONFIG.CHECK_IN_RADIUS_METERS,
        drinkQuestPartner: partner,
        rewardTier: partner
          ? PlaceVisitRewardTier.SUBSCRIBED
          : PlaceVisitRewardTier.STANDARD,
      };
    }

    return {
      bar,
      externalPlaceId: null,
      googlePlaceId: null,
      placeLat: bar.latitude,
      placeLng: bar.longitude,
      radiusMeters:
        bar.checkInRadiusMeters ?? PLACE_VISIT_CONFIG.CHECK_IN_RADIUS_METERS,
      drinkQuestPartner: partner,
      rewardTier: partner
        ? PlaceVisitRewardTier.SUBSCRIBED
        : PlaceVisitRewardTier.STANDARD,
    };
  }

  private async loadBar(barId: string): Promise<BarWithSub> {
    const bar = await this.prisma.bar.findFirst({
      where: { id: barId, deletedAt: null, isActive: true },
      include: { subscription: true },
    });
    if (!bar) {
      throw new BadRequestException('Establecimiento no encontrado.');
    }
    return bar;
  }

  private async findPriorVisits(
    userId: string,
    googlePlaceId: string | null,
    barId: string | null,
  ): Promise<PlaceVisit[]> {
    if (googlePlaceId) {
      return this.prisma.placeVisit.findMany({
        where: { userId, googlePlaceId },
        orderBy: { visitedAt: 'desc' },
      });
    }
    if (barId) {
      return this.prisma.placeVisit.findMany({
        where: { userId, barId, googlePlaceId: null },
        orderBy: { visitedAt: 'desc' },
      });
    }
    return [];
  }

  private fail(
    status: PlaceCheckInResponseDto['status'],
    message: string,
    extra: Partial<PlaceCheckInResponseDto> = {},
  ): PlaceCheckInResponseDto {
    return {
      status,
      xpAwarded: extra.xpAwarded ?? 0,
      firstVisit: extra.firstVisit ?? false,
      message,
      ...extra,
    };
  }
}

function sameDate(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}
