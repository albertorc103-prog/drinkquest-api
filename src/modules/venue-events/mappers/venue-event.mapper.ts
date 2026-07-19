import {
  VenueEventModerationStatus,
  VenueEventStatus,
} from '@prisma/client';

type VenueEventRow = {
  id: string;
  barId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  status: VenueEventStatus;
  moderationStatus: VenueEventModerationStatus;
  removalReason: string | null;
  removedAt: Date | null;
  policiesAcceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  bar?: {
    id: string;
    businessName: string;
    slug: string;
    logoUrl: string | null;
    city: string | null;
  };
};

export function mapVenueEvent(row: VenueEventRow) {
  return {
    id: row.id,
    barId: row.barId,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    moderationStatus: row.moderationStatus,
    removalReason: row.removalReason,
    removedAt: row.removedAt?.toISOString() ?? null,
    policiesAcceptedAt: row.policiesAcceptedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isLive:
      row.status === VenueEventStatus.ACTIVE &&
      row.moderationStatus === VenueEventModerationStatus.VISIBLE,
    bar: row.bar
      ? {
          id: row.bar.id,
          businessName: row.bar.businessName,
          slug: row.bar.slug,
          logoUrl: row.bar.logoUrl,
          city: row.bar.city,
        }
      : undefined,
  };
}
