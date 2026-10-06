import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PromotionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { assertAgeGateForSensitiveAction } from '../../common/utils/age-gate.util';
import { evaluateSubscriptionActive } from '../subscriptions/bar-access.rules';
import { ExternalPlaceService } from './external-place.service';
import { PLACE_DISCOVERY_CONFIG } from './place-discovery.config';
import { haversineMeters } from './place-visit.geo';
import {
  DiscoveryCandidateDto,
  DiscoveryNearbyDto,
  DiscoveryNearbyResponseDto,
  ResolvedPlaceDto,
} from './dto/discovery-nearby.dto';

type Ranked = DiscoveryCandidateDto & { _distance: number };

@Injectable()
export class PlaceDiscoveryService {
  private readonly logger = new Logger(PlaceDiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalPlaces: ExternalPlaceService,
  ) {}

  async nearby(
    userId: string,
    dto: DiscoveryNearbyDto,
  ): Promise<DiscoveryNearbyResponseDto> {
    const actor = await this.requireActor(userId);
    assertAgeGateForSensitiveAction(actor);
    this.assertValidCoords(dto.latitude, dto.longitude);

    const limit = Math.min(
      dto.limit ?? PLACE_DISCOVERY_CONFIG.MAX_CANDIDATES,
      PLACE_DISCOVERY_CONFIG.MAX_CANDIDATES,
    );
    const radius = PLACE_DISCOVERY_CONFIG.SEARCH_RADIUS_METERS;
    const { latMin, latMax, lngMin, lngMax } = boundingBox(
      dto.latitude,
      dto.longitude,
      radius,
    );

    const seedIds = normalizeSeedPlaceIds(dto.seedPlaceIds);

    const [bars, externals, visits, promoBarIds] = await Promise.all([
      this.prisma.bar.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          latitude: { gte: latMin, lte: latMax },
          longitude: { gte: lngMin, lte: lngMax },
        },
        select: {
          id: true,
          businessName: true,
          latitude: true,
          longitude: true,
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
        take: 400,
      }),
      this.prisma.externalPlace.findMany({
        where: {
          latitude: { gte: latMin, lte: latMax },
          longitude: { gte: lngMin, lte: lngMax },
          contentCachedAt: { not: null },
        },
        take: 400,
      }),
      this.prisma.placeVisit.findMany({
        where: { userId },
        select: {
          googlePlaceId: true,
          barId: true,
          visitedAt: true,
        },
        orderBy: { visitedAt: 'desc' },
        take: 500,
      }),
      this.prisma.barPromotion.findMany({
        where: {
          status: PromotionStatus.ACTIVE,
          startsAt: { lte: new Date() },
          endsAt: { gte: new Date() },
        },
        select: { barId: true },
        take: 300,
      }),
    ]);

    const promoSet = new Set(promoBarIds.map((p) => p.barId));
    const lastVisitByKey = new Map<string, Date>();
    for (const v of visits) {
      const key = v.googlePlaceId
        ? `g:${v.googlePlaceId}`
        : v.barId
          ? `b:${v.barId}`
          : null;
      if (!key || lastVisitByKey.has(key)) continue;
      lastVisitByKey.set(key, v.visitedAt);
    }

    const candidates: Ranked[] = [];
    const seenGoogle = new Set<string>();
    const googleIds = new Set<string>();
    const barIds = new Set<string>();

    for (const b of bars) {
      barIds.add(b.id);
      if (b.googlePlaceId) googleIds.add(b.googlePlaceId);
    }
    for (const e of externals) {
      if (this.externalPlaces.hasUsableCoords(e)) googleIds.add(e.googlePlaceId);
    }

    // Semillas: resolver ExternalPlace / Bar por place_id (autoridad backend).
    const seededExternals = await this.resolveSeedExternals(seedIds, seenGoogle);
    for (const e of seededExternals) {
      if (this.externalPlaces.hasUsableCoords(e)) googleIds.add(e.googlePlaceId);
    }

    const reviewStats = await this.loadReviewStats([...googleIds], [...barIds]);

    for (const bar of bars) {
      const ranked = this.rankBar(
        bar,
        dto.latitude,
        dto.longitude,
        radius,
        promoSet,
        lastVisitByKey,
        reviewStats,
      );
      if (!ranked) continue;
      if (bar.googlePlaceId) seenGoogle.add(bar.googlePlaceId);
      candidates.push(ranked);
    }

    const allExternals = [...externals, ...seededExternals];
    const seenExtId = new Set<string>();
    for (const ext of allExternals) {
      if (seenExtId.has(ext.googlePlaceId)) continue;
      seenExtId.add(ext.googlePlaceId);
      if (!this.externalPlaces.hasUsableCoords(ext)) continue;
      if (seenGoogle.has(ext.googlePlaceId)) continue;
      const ranked = this.rankExternal(
        ext,
        dto.latitude,
        dto.longitude,
        radius,
        lastVisitByKey,
        reviewStats,
      );
      if (!ranked) continue;
      candidates.push(ranked);
    }

    candidates.sort((a, b) => {
      if (b.discoveryPriority !== a.discoveryPriority) {
        return b.discoveryPriority - a.discoveryPriority;
      }
      return a._distance - b._distance;
    });

    const trimmed = candidates.slice(0, limit).map(({ _distance, ...rest }) => rest);

    this.logger.log(
      JSON.stringify({
        event: 'discovery_nearby',
        userIdHash: userId.slice(0, 8),
        candidates: trimmed.length,
        seedsReceived: seedIds.length,
        seedsResolved: seededExternals.length,
      }),
    );

    return {
      candidates: trimmed,
      regionRadiusMeters: PLACE_DISCOVERY_CONFIG.REGION_GEOFENCE_RADIUS_METERS,
      placeGeofenceRadiusMeters: PLACE_DISCOVERY_CONFIG.PLACE_GEOFENCE_RADIUS_METERS,
      searchRadiusMeters: PLACE_DISCOVERY_CONFIG.SEARCH_RADIUS_METERS,
    };
  }

  /**
   * Resuelve placeKey para deep link (ficha Explore).
   * No confía en nombre; solo IDs canónicos.
   */
  async resolvePlace(userId: string, placeKeyRaw: string): Promise<ResolvedPlaceDto> {
    const actor = await this.requireActor(userId);
    assertAgeGateForSensitiveAction(actor);

    const parsed = parsePlaceKey(placeKeyRaw);
    if (!parsed) {
      return { available: false, message: 'Este lugar ya no está disponible.' };
    }

    if (parsed.kind === 'dq') {
      const bar = await this.prisma.bar.findFirst({
        where: { id: parsed.id, deletedAt: null, isActive: true },
        select: {
          id: true,
          businessName: true,
          latitude: true,
          longitude: true,
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
      if (
        !bar ||
        bar.latitude == null ||
        bar.longitude == null ||
        !Number.isFinite(bar.latitude) ||
        !Number.isFinite(bar.longitude)
      ) {
        return { available: false, message: 'Este lugar ya no está disponible.' };
      }
      const stats = await this.loadReviewStats(
        bar.googlePlaceId ? [bar.googlePlaceId] : [],
        [bar.id],
      );
      const review =
        (bar.googlePlaceId && stats.byGoogle.get(bar.googlePlaceId)) ||
        stats.byBar.get(bar.id) ||
        { avg: null as number | null, count: 0 };
      const partner = evaluateSubscriptionActive(bar.subscription).allowed;
      return {
        available: true,
        placeKey: bar.googlePlaceId?.trim() || `dq:${bar.id}`,
        placeType: 'DRINKQUEST_BAR',
        barId: bar.id,
        googlePlaceId: bar.googlePlaceId,
        name: bar.businessName,
        latitude: bar.latitude,
        longitude: bar.longitude,
        drinkQuestRating: review.avg,
        drinkQuestReviewCount: review.count,
        drinkQuestPartner: partner,
      };
    }

    // Google place_id
    const googlePlaceId = parsed.id;
    const bar = await this.prisma.bar.findFirst({
      where: {
        googlePlaceId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        businessName: true,
        latitude: true,
        longitude: true,
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
    if (
      bar &&
      bar.latitude != null &&
      bar.longitude != null &&
      Number.isFinite(bar.latitude) &&
      Number.isFinite(bar.longitude)
    ) {
      const stats = await this.loadReviewStats([googlePlaceId], [bar.id]);
      const review =
        stats.byGoogle.get(googlePlaceId) ||
        stats.byBar.get(bar.id) ||
        { avg: null as number | null, count: 0 };
      return {
        available: true,
        placeKey: googlePlaceId,
        placeType: 'DRINKQUEST_BAR',
        barId: bar.id,
        googlePlaceId,
        name: bar.businessName,
        latitude: bar.latitude,
        longitude: bar.longitude,
        drinkQuestRating: review.avg,
        drinkQuestReviewCount: review.count,
        drinkQuestPartner: evaluateSubscriptionActive(bar.subscription).allowed,
      };
    }

    try {
      const ext = await this.externalPlaces.resolveForCheckIn(googlePlaceId);
      if (!this.externalPlaces.hasUsableCoords(ext) || ext.latitude == null || ext.longitude == null) {
        return { available: false, message: 'Este lugar ya no está disponible.' };
      }
      const stats = await this.loadReviewStats([googlePlaceId], []);
      const review = stats.byGoogle.get(googlePlaceId) || {
        avg: null as number | null,
        count: 0,
      };
      return {
        available: true,
        placeKey: googlePlaceId,
        placeType: 'EXTERNAL',
        barId: null,
        googlePlaceId,
        name: ext.name?.trim() || 'Lugar cercano',
        latitude: ext.latitude,
        longitude: ext.longitude,
        drinkQuestRating: review.avg,
        drinkQuestReviewCount: review.count,
        drinkQuestPartner: false,
      };
    } catch {
      return { available: false, message: 'Este lugar ya no está disponible.' };
    }
  }

  private async resolveSeedExternals(
    seedIds: string[],
    alreadySeenGoogle: Set<string>,
  ) {
    const out: Awaited<ReturnType<ExternalPlaceService['resolveForCheckIn']>>[] =
      [];
    let resolveCalls = 0;
    for (const id of seedIds) {
      if (alreadySeenGoogle.has(id)) continue;
      const existing = await this.prisma.externalPlace.findUnique({
        where: { googlePlaceId: id },
      });
      if (existing && this.externalPlaces.hasUsableCoords(existing)) {
        out.push(existing);
        continue;
      }
      if (resolveCalls >= PLACE_DISCOVERY_CONFIG.MAX_SEED_RESOLVE_CALLS) continue;
      resolveCalls += 1;
      try {
        const resolved = await this.externalPlaces.resolveForCheckIn(id);
        if (this.externalPlaces.hasUsableCoords(resolved)) {
          out.push(resolved);
        }
      } catch {
        // place_id inválido / Places caído → omitir; no inventar candidato.
      }
    }
    return out;
  }

  private rankBar(
    bar: {
      id: string;
      businessName: string;
      latitude: number | null;
      longitude: number | null;
      googlePlaceId: string | null;
      subscription: any;
    },
    userLat: number,
    userLng: number,
    radius: number,
    promoSet: Set<string>,
    lastVisitByKey: Map<string, Date>,
    reviewStats: {
      byGoogle: Map<string, { avg: number | null; count: number }>;
      byBar: Map<string, { avg: number | null; count: number }>;
    },
  ): Ranked | null {
    if (bar.latitude == null || bar.longitude == null) return null;
    if (!Number.isFinite(bar.latitude) || !Number.isFinite(bar.longitude)) return null;
    const distance = haversineMeters(userLat, userLng, bar.latitude, bar.longitude);
    if (distance > radius) return null;
    const partner = evaluateSubscriptionActive(bar.subscription).allowed;
    const stats =
      (bar.googlePlaceId && reviewStats.byGoogle.get(bar.googlePlaceId)) ||
      reviewStats.byBar.get(bar.id) ||
      { avg: null as number | null, count: 0 };
    const visitKey = bar.googlePlaceId ? `g:${bar.googlePlaceId}` : `b:${bar.id}`;
    const lastVisit = lastVisitByKey.get(visitKey);
    const hasPromo = promoSet.has(bar.id);
    const { priority, reason } = scoreCandidate({
      distanceMeters: distance,
      partner,
      rating: stats.avg,
      reviewCount: stats.count,
      hasPromo,
      lastVisitAt: lastVisit,
    });
    return {
      placeKey: bar.googlePlaceId?.trim() || `dq:${bar.id}`,
      placeType: 'DRINKQUEST_BAR',
      barId: bar.id,
      googlePlaceId: bar.googlePlaceId,
      name: bar.businessName,
      latitude: bar.latitude,
      longitude: bar.longitude,
      geofenceRadiusMeters: PLACE_DISCOVERY_CONFIG.PLACE_GEOFENCE_RADIUS_METERS,
      drinkQuestRating: stats.avg,
      drinkQuestReviewCount: stats.count,
      drinkQuestPartner: partner,
      discoveryPriority: priority,
      discoveryReason: reason,
      hasActivePromotion: hasPromo,
      _distance: distance,
    };
  }

  private rankExternal(
    ext: {
      googlePlaceId: string;
      name: string | null;
      latitude: number | null;
      longitude: number | null;
    },
    userLat: number,
    userLng: number,
    radius: number,
    lastVisitByKey: Map<string, Date>,
    reviewStats: {
      byGoogle: Map<string, { avg: number | null; count: number }>;
      byBar: Map<string, { avg: number | null; count: number }>;
    },
  ): Ranked | null {
    if (ext.latitude == null || ext.longitude == null) return null;
    const distance = haversineMeters(userLat, userLng, ext.latitude, ext.longitude);
    if (distance > radius) return null;
    const stats = reviewStats.byGoogle.get(ext.googlePlaceId) || {
      avg: null as number | null,
      count: 0,
    };
    const lastVisit = lastVisitByKey.get(`g:${ext.googlePlaceId}`);
    const { priority, reason } = scoreCandidate({
      distanceMeters: distance,
      partner: false,
      rating: stats.avg,
      reviewCount: stats.count,
      hasPromo: false,
      lastVisitAt: lastVisit,
    });
    return {
      placeKey: ext.googlePlaceId,
      placeType: 'EXTERNAL',
      barId: null,
      googlePlaceId: ext.googlePlaceId,
      name: ext.name?.trim() || 'Lugar cercano',
      latitude: ext.latitude,
      longitude: ext.longitude,
      geofenceRadiusMeters: PLACE_DISCOVERY_CONFIG.PLACE_GEOFENCE_RADIUS_METERS,
      drinkQuestRating: stats.avg,
      drinkQuestReviewCount: stats.count,
      drinkQuestPartner: false,
      discoveryPriority: priority,
      discoveryReason: reason,
      hasActivePromotion: false,
      _distance: distance,
    };
  }

  private async requireActor(userId: string) {
    const actor = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        role: true,
        ageVerifiedAt: true,
        createdAt: true,
      },
    });
    if (!actor) throw new ForbiddenException('Usuario no autorizado.');
    return actor;
  }

  private assertValidCoords(latitude: number, longitude: number) {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('Coordenadas inválidas.');
    }
  }

  private async loadReviewStats(
    googleIds: string[],
    barIds: string[],
  ): Promise<{
    byGoogle: Map<string, { avg: number | null; count: number }>;
    byBar: Map<string, { avg: number | null; count: number }>;
  }> {
    const byGoogle = new Map<string, { avg: number | null; count: number }>();
    const byBar = new Map<string, { avg: number | null; count: number }>();
    if (googleIds.length === 0 && barIds.length === 0) {
      return { byGoogle, byBar };
    }

    const groups = await this.prisma.placeReview.groupBy({
      by: ['googlePlaceId', 'barId'],
      where: {
        OR: [
          ...(googleIds.length ? [{ googlePlaceId: { in: googleIds } }] : []),
          ...(barIds.length
            ? [{ barId: { in: barIds }, googlePlaceId: null }]
            : []),
        ],
      },
      _avg: { rating: true },
      _count: { _all: true },
    });

    for (const g of groups) {
      const avg =
        g._count._all > 0
          ? Math.round((g._avg.rating ?? 0) * 10) / 10
          : null;
      const entry = { avg, count: g._count._all };
      if (g.googlePlaceId) {
        const prev = byGoogle.get(g.googlePlaceId);
        if (!prev || entry.count > prev.count) byGoogle.set(g.googlePlaceId, entry);
      } else if (g.barId) {
        byBar.set(g.barId, entry);
      }
    }
    return { byGoogle, byBar };
  }
}

function boundingBox(lat: number, lng: number, radiusMeters: number) {
  const latDelta = radiusMeters / 111_320;
  const lngDelta =
    radiusMeters / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  return {
    latMin: lat - latDelta,
    latMax: lat + latDelta,
    lngMin: lng - lngDelta,
    lngMax: lng + lngDelta,
  };
}

function scoreCandidate(input: {
  distanceMeters: number;
  partner: boolean;
  rating: number | null;
  reviewCount: number;
  hasPromo: boolean;
  lastVisitAt?: Date;
}): { priority: number; reason: string | null } {
  const cfg = PLACE_DISCOVERY_CONFIG;
  let score = 0;
  const reasons: string[] = [];

  const distScore = Math.max(
    0,
    20 * (1 - input.distanceMeters / cfg.SEARCH_RADIUS_METERS),
  );
  score += distScore;

  if (input.partner) {
    score += cfg.SCORE_PARTNER;
    reasons.push('Forma parte de DrinkQuest');
  }
  if (input.rating != null && input.reviewCount > 0) {
    score += input.rating * cfg.SCORE_RATING_PER_STAR;
    score += Math.log10(input.reviewCount + 1) * cfg.SCORE_REVIEW_LOG_FACTOR;
    if (input.rating >= 4.5 && input.reviewCount >= 5) {
      reasons.push('Muy bien valorado por la comunidad');
    }
  } else if (!input.partner) {
    reasons.push('Nuevo en DrinkQuest');
  }
  if (input.hasPromo) {
    score += cfg.SCORE_ACTIVE_PROMO;
    reasons.push('Tiene una promoción activa');
  }

  if (input.lastVisitAt) {
    const ageH =
      (Date.now() - input.lastVisitAt.getTime()) / (1000 * 60 * 60);
    if (ageH < 48) score -= cfg.SCORE_RECENT_VISIT_PENALTY;
    else score -= cfg.SCORE_ANY_VISIT_PENALTY;
  }

  return {
    priority: Math.round(score * 10),
    reason: reasons[0] ?? null,
  };
}

function normalizeSeedPlaceIds(raw?: string[]): string[] {
  if (!raw?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    let id = item.trim();
    if (id.toLowerCase().startsWith('google:')) {
      id = id.slice('google:'.length).trim();
    }
    if (!id || id.startsWith('osm:') || id.startsWith('dq:') || id.startsWith('bar:')) {
      continue;
    }
    if (id.length > 256) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= PLACE_DISCOVERY_CONFIG.MAX_SEED_PLACE_IDS) break;
  }
  return out;
}

export function parsePlaceKey(
  raw: string,
): { kind: 'google' | 'dq'; id: string } | null {
  const key = raw.trim();
  if (!key || key === 'unknown') return null;
  if (key.toLowerCase().startsWith('google:')) {
    const id = key.slice('google:'.length).trim();
    return id ? { kind: 'google', id } : null;
  }
  if (key.startsWith('dq:')) {
    const id = key.slice(3).trim();
    return id ? { kind: 'dq', id } : null;
  }
  if (key.startsWith('bar:')) {
    // Local Room id — no resoluble en backend.
    return null;
  }
  return { kind: 'google', id: key };
}
