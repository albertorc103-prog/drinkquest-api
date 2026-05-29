import { BarAccessDenialReason } from '../enums/bar-access-denial-reason.enum';

export interface AccessDecision {
  allowed: boolean;
  reason?: BarAccessDenialReason;
  message?: string;
}
