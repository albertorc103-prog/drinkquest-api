export type SubscriptionActorSource = 'admin' | 'system' | 'stripe';

export interface SubscriptionChangeContext {
  actorUserId?: string;
  actorSource: SubscriptionActorSource;
  reason?: string;
}
