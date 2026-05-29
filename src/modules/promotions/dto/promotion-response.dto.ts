import {
  PromotionApprovalStatus,
  PromotionPlacementType,
  PromotionStatus,
} from '@prisma/client';

export interface PromotionBarSummaryDto {
  id: string;
  businessName: string;
  slug: string;
  logoUrl: string | null;
  city: string | null;
}

export interface PromotionAnalyticsSummaryDto {
  impressions: number;
  opens: number;
  qrScans: number;
}

export interface PromotionResponseDto {
  id: string;
  barId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string;
  status: PromotionStatus;
  priority: number;
  placementType: PromotionPlacementType;
  approvalStatus: PromotionApprovalStatus;
  rejectionReason: string | null;
  moderatedByAdminId: string | null;
  moderatedAt: string | null;
  rankingScore: number;
  createdAt: string;
  updatedAt: string;
  analytics?: PromotionAnalyticsSummaryDto;
  bar?: PromotionBarSummaryDto;
}

export interface PromotionFeedPageDto {
  items: PromotionResponseDto[];
  page: number;
  limit: number;
  total: number;
}
