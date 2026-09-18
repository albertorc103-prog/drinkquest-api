import { Injectable } from '@nestjs/common';
import { ExternalPlace, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PLACE_VISIT_CONFIG } from './place-visit.config';
import {
  GooglePlaceDetailsResult,
  GooglePlacesDetailsClient,
} from './google-places-details.client';

@Injectable()
export class ExternalPlaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly places: GooglePlacesDetailsClient,
  ) {}

  /** true si lat/lng están presentes y contentCachedAt < 30 días. */
  hasUsableCoords(place: ExternalPlace, now: Date = new Date()): boolean {
    if (
      place.latitude == null ||
      place.longitude == null ||
      !Number.isFinite(place.latitude) ||
      !Number.isFinite(place.longitude)
    ) {
      return false;
    }
    if (!place.contentCachedAt) return false;
    const maxMs =
      PLACE_VISIT_CONFIG.PLACES_COORDS_CACHE_MAX_DAYS * 24 * 60 * 60 * 1000;
    return now.getTime() - place.contentCachedAt.getTime() <= maxMs;
  }

  /**
   * Asegura ExternalPlace + coords confiables (caché o Place Details).
   * No crea ExternalPlace sin googlePlaceId.
   */
  async resolveForCheckIn(
    googlePlaceId: string,
    now: Date = new Date(),
  ): Promise<ExternalPlace> {
    const id = googlePlaceId.trim();
    let row = await this.prisma.externalPlace.findUnique({
      where: { googlePlaceId: id },
    });

    if (row && this.hasUsableCoords(row, now)) {
      return row;
    }

    // Caché vencida: borrar coords/metadata antes de refrescar (SST §14.3).
    if (row && !this.hasUsableCoords(row, now)) {
      await this.clearExpiredContent(row.id);
    }

    const details = await this.places.fetchPlaceDetails(id);
    return this.upsertFromDetails(details, now);
  }

  async upsertFromDetails(
    details: GooglePlaceDetailsResult,
    now: Date = new Date(),
  ): Promise<ExternalPlace> {
    const data: Prisma.ExternalPlaceUncheckedCreateInput = {
      googlePlaceId: details.googlePlaceId,
      name: details.name,
      latitude: details.latitude,
      longitude: details.longitude,
      primaryType: details.primaryType,
      city: details.city,
      contentCachedAt: now,
      placeIdRefreshedAt: now,
    };

    return this.prisma.externalPlace.upsert({
      where: { googlePlaceId: details.googlePlaceId },
      create: data,
      update: {
        name: details.name,
        latitude: details.latitude,
        longitude: details.longitude,
        primaryType: details.primaryType,
        city: details.city,
        contentCachedAt: now,
        placeIdRefreshedAt: now,
      },
    });
  }

  /** Solo ensure fila por place_id (sin coords) — no usado en check-in sin refresh. */
  async ensureStub(googlePlaceId: string): Promise<ExternalPlace> {
    const id = googlePlaceId.trim();
    const existing = await this.prisma.externalPlace.findUnique({
      where: { googlePlaceId: id },
    });
    if (existing) return existing;
    return this.prisma.externalPlace.create({
      data: { googlePlaceId: id },
    });
  }

  private async clearExpiredContent(id: string): Promise<void> {
    await this.prisma.externalPlace.update({
      where: { id },
      data: {
        latitude: null,
        longitude: null,
        name: null,
        primaryType: null,
        city: null,
        contentCachedAt: null,
      },
    });
  }
}
