import { PlaceVisitRewardTier } from '@prisma/client';

export type PlaceCheckInStatus =
  | 'FIRST_VISIT'
  | 'RETURN_VISIT'
  | 'ALREADY_VISITED_TODAY'
  | 'TOO_SOON'
  | 'OUT_OF_RANGE'
  | 'INACCURATE'
  | 'PLACE_NOT_FOUND'
  | 'PLACE_COORDS_UNAVAILABLE'
  | 'BAD_REQUEST';

export class PlaceCheckInResponseDto {
  status!: PlaceCheckInStatus;
  visitId?: string;
  xpAwarded!: number;
  firstVisit!: boolean;
  rewardTier?: PlaceVisitRewardTier;
  distanceMeters?: number;
  totalXp?: number;
  level?: number;
  message?: string;
  barId?: string | null;
  externalPlaceId?: string | null;
  googlePlaceId?: string | null;
  drinkQuestPartner?: boolean;
}

export class MyVisitedPlaceDto {
  collectionKey!: string;
  barId?: string | null;
  externalPlaceId?: string | null;
  googlePlaceId?: string | null;
  name!: string;
  visitCount!: number;
  firstVisitAt!: string;
  lastVisitAt!: string;
  /** Estado visual actual (suscripción activa), no histórico. */
  drinkQuestPartner!: boolean;
  primaryType?: string | null;
  city?: string | null;
  logoUrl?: string | null;
  /** Suma de XP otorgado en visitas a este lugar. */
  totalXpAwarded?: number;
}

export class MyVisitedPlacesResponseDto {
  items!: MyVisitedPlaceDto[];
  total!: number;
}
