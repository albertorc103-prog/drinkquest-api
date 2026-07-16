import {
  BarReservationStatus,
} from '@prisma/client';

export type ReservationRow = {
  id: string;
  barId: string;
  userId: string;
  guestName: string;
  partySize: number;
  reservedFor: Date;
  notes: string | null;
  status: BarReservationStatus;
  barResponse: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  bar?: {
    id: string;
    businessName: string;
    slug: string;
    logoUrl: string | null;
    city?: string | null;
    address?: string | null;
  };
  user?: {
    id: string;
    displayName: string;
    email: string;
  };
};

export function mapReservation(row: ReservationRow) {
  return {
    id: row.id,
    barId: row.barId,
    userId: row.userId,
    guestName: row.guestName,
    partySize: row.partySize,
    reservedFor: row.reservedFor.toISOString(),
    notes: row.notes,
    status: row.status,
    barResponse: row.barResponse,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    bar: row.bar
      ? {
          id: row.bar.id,
          businessName: row.bar.businessName,
          slug: row.bar.slug,
          logoUrl: row.bar.logoUrl,
          city: row.bar.city ?? null,
          address: row.bar.address ?? null,
        }
      : undefined,
    user: row.user
      ? {
          id: row.user.id,
          displayName: row.user.displayName,
          email: row.user.email,
        }
      : undefined,
  };
}
