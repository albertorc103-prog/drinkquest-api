import { Bar, BarSubscription } from '@prisma/client';

export type BarAccessContext = {
  bar: Pick<Bar, 'id' | 'ownerUserId' | 'businessName' | 'isActive' | 'deletedAt'>;
  subscription: BarSubscription | null;
};
