import { Bar, BarPromotion } from '@prisma/client';
import {
  PromotionAnalyticsSummaryDto,
  PromotionResponseDto,
} from '../dto/promotion-response.dto';

type PromotionWithBar = BarPromotion & { bar?: Pick<Bar, 'id' | 'businessName' | 'slug' | 'logoUrl' | 'city'> };

export function mapPromotion(
  promo: PromotionWithBar,
  analytics?: PromotionAnalyticsSummaryDto,
): PromotionResponseDto {
  return {
    id: promo.id,
    barId: promo.barId,
    title: promo.title,
    description: promo.description,
    imageUrl: promo.imageUrl,
    startsAt: promo.startsAt.toISOString(),
    endsAt: promo.endsAt.toISOString(),
    status: promo.status,
    priority: promo.priority,
    placementType: promo.placementType,
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
