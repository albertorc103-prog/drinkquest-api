import { Bar, BarPromotion } from '@prisma/client';
import { buildPublicObjectUrl } from '../../uploads/utils/minio-url.util';
import {
  PromotionAnalyticsSummaryDto,
  PromotionResponseDto,
} from '../dto/promotion-response.dto';

type PromotionWithBar = BarPromotion & { bar?: Pick<Bar, 'id' | 'businessName' | 'slug' | 'logoUrl' | 'city'> };

/** Corrige URLs R2 guardadas con /drinkquest/ de más en el path público. */
function normalizePromotionImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  if (imageUrl.includes('.r2.dev') && imageUrl.includes('/drinkquest/')) {
    return imageUrl.replace('/drinkquest/', '/');
  }
  return imageUrl;
}

export function mapPromotion(
  promo: PromotionWithBar,
  analytics?: PromotionAnalyticsSummaryDto,
): PromotionResponseDto {
  return {
    id: promo.id,
    barId: promo.barId,
    title: promo.title,
    description: promo.description,
    imageUrl: normalizePromotionImageUrl(promo.imageUrl),
    startsAt: promo.startsAt.toISOString(),
    endsAt: promo.endsAt.toISOString(),
    status: promo.status,
    priority: promo.priority,
    placementType: promo.placementType,
    eventTheme: promo.eventTheme,
    approvalStatus: promo.approvalStatus,
    rejectionReason: promo.rejectionReason,
    moderatedByAdminId: promo.moderatedByAdminId,
    moderatedAt: promo.moderatedAt ? promo.moderatedAt.toISOString() : null,
    rankingScore: promo.rankingScore,
    createdAt: promo.createdAt.toISOString(),
    updatedAt: promo.updatedAt.toISOString(),
    analytics,
    bar: promo.bar
      ? {
          id: promo.bar.id,
          businessName: promo.bar.businessName,
          slug: promo.bar.slug,
          logoUrl: promo.bar.logoUrl,
          city: promo.bar.city,
        }
      : undefined,
  };
}
