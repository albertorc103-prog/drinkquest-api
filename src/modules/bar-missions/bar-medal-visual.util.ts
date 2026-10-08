import { BadRequestException } from '@nestjs/common';
import { BarMedalVisualMode, Prisma } from '@prisma/client';
import {
  resolveDesignConfigForClient,
  toPublicDesignConfig,
} from './bar-medal-design-config';

export type MedalVisualFields = {
  visualMode: BarMedalVisualMode;
  artworkUrl: string | null;
  artworkAvailable: boolean;
  designConfig: unknown;
  visual: ReturnType<typeof toPublicDesignConfig>;
  designConfigValid: boolean;
  isLegacyVisualFallback: boolean;
};

/** Campos visuales seguros para BAR / USER / público (sin storage privado). */
export function mapMedalVisualFields(version: {
  visualMode?: BarMedalVisualMode | null;
  artworkUrl?: string | null;
  designConfig: Prisma.JsonValue | null | unknown;
}): MedalVisualFields {
  const visualMode = version.visualMode ?? BarMedalVisualMode.BUILDER_V1;
  const artworkUrl =
    typeof version.artworkUrl === 'string' && version.artworkUrl.trim().length > 0
      ? version.artworkUrl.trim()
      : null;
  const artworkAvailable = artworkUrl != null;
  const resolved = resolveDesignConfigForClient(version.designConfig);
  return {
    visualMode,
    artworkUrl,
    artworkAvailable,
    designConfig: version.designConfig ?? null,
    visual: toPublicDesignConfig(resolved.designConfig),
    designConfigValid: resolved.designConfigValid,
    isLegacyVisualFallback: resolved.isLegacyFallback,
  };
}

export function assertArtworkReadyForPublish(version: {
  visualMode?: BarMedalVisualMode | null;
  artworkUrl?: string | null;
}): void {
  const mode = version.visualMode ?? BarMedalVisualMode.BUILDER_V1;
  if (mode !== BarMedalVisualMode.ADMIN_ARTWORK) return;
  const url = version.artworkUrl?.trim();
  if (!url) {
    throw new BadRequestException('MEDAL_ARTWORK_REQUIRED');
  }
}
