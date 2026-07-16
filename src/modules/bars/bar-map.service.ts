import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { evaluateSubscriptionActive } from '../subscriptions/bar-access.rules';
import {
  featuredMapBoostForPlan,
  normalizeSubscriptionPlan,
} from '../subscriptions/subscription-plan.util';

export interface FeaturedBarsQuery {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}

/** Bares con suscripción activa y coordenadas, para destacarlos en el mapa del consumidor. */
@Injectable()
export class BarMapService {
  constructor(private readonly prisma: PrismaService) {}

  async featuredBars(query: FeaturedBarsQuery) {
    const bars = await this.prisma.bar.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        businessName: true,
        slug: true,
        description: true,
        address: true,
        city: true,
        latitude: true,
        longitude: true,
        logoUrl: true,
        bannerUrl: true,
        subscription: {
          select: {
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
            canceledAt: true,
            qrEnabled: true,
            promoEnabled: true,
            plan: true,
          },
        },
      },
    });

    const now = new Date();
    const hasOrigin =
      Number.isFinite(query.latitude) && Number.isFinite(query.longitude);

    const items = bars
      .filter((bar) => evaluateSubscriptionActive(bar.subscription, now).allowed)
      .map((bar) => {
        const plan = normalizeSubscriptionPlan(bar.subscription?.plan);
        const legendBoost = featuredMapBoostForPlan(plan);
        const distanceKm =
          hasOrigin && bar.latitude != null && bar.longitude != null
            ? haversineKm(query.latitude!, query.longitude!, bar.latitude, bar.longitude)
            : null;
        return {
          id: bar.id,
          businessName: bar.businessName,
          slug: bar.slug,
          description: bar.description,
          address: bar.address,
          city: bar.city,
          latitude: bar.latitude as number,
          longitude: bar.longitude as number,
          logoUrl: bar.logoUrl,
          bannerUrl: bar.bannerUrl,
          plan,
          featured: true,
          legendBoost,
          distanceKm,
        };
      })
      .filter((bar) =>
        query.radiusKm != null && bar.distanceKm != null
          ? bar.distanceKm <= query.radiusKm
          : true,
      )
      .sort((a, b) => {
        if (a.legendBoost !== b.legendBoost) {
          return a.legendBoost ? -1 : 1;
        }
        return (a.distanceKm ?? Number.MAX_SAFE_INTEGER) - (b.distanceKm ?? Number.MAX_SAFE_INTEGER);
      });

    return { items, total: items.length };
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
