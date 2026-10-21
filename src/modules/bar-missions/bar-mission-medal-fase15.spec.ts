import {
  BarMissionMedalVersionStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { evaluateLegendMedalOperational } from './bar-mission-medal-legend-operational.util';
import {
  appendModerationAuditEvent,
  extractModerationAudit,
} from './bar-mission-medal-moderation-audit.util';
import { pickCanonicalOfficialWorkflowVersion } from './bar-mission-medal-official-workflow.util';

describe('BarMissionMedal FASE 15', () => {
  it('evaluateLegendMedalOperational: plan inferior bloquea operación', () => {
    const state = evaluateLegendMedalOperational({
      plan: SubscriptionPlan.EXPLORER,
      status: SubscriptionStatus.ACTIVE,
      trialEndsAt: null,
      currentPeriodEnd: new Date(Date.now() + 86400000),
      canceledAt: null,
      qrEnabled: true,
      promoEnabled: true,
    });
    expect(state.operational).toBe(false);
    expect(state.subscriptionSuspended).toBe(true);
  });

  it('evaluateLegendMedalOperational: ACTIVE con periodo vigente permite operación', () => {
    const state = evaluateLegendMedalOperational({
      plan: SubscriptionPlan.LEGEND,
      status: SubscriptionStatus.ACTIVE,
      trialEndsAt: null,
      currentPeriodEnd: new Date(Date.now() + 86400000),
      canceledAt: null,
      qrEnabled: true,
      promoEnabled: true,
    });
    expect(state.operational).toBe(true);
  });

  it('pickCanonicalOfficialWorkflowVersion prioriza ACTIVE', () => {
    const canonical = pickCanonicalOfficialWorkflowVersion([
      {
        id: 'v1',
        seasonId: 's1',
        version: 1,
        status: BarMissionMedalVersionStatus.PENDING_REVIEW,
        submittedAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'v2',
        seasonId: 's2',
        version: 1,
        status: BarMissionMedalVersionStatus.ACTIVE,
        submittedAt: null,
        updatedAt: new Date(),
      },
    ]);
    expect(canonical?.id).toBe('v2');
  });

  it('moderation audit append/extract', () => {
    const cfg = appendModerationAuditEvent(null, {
      action: 'CORRECTION_REQUIRED',
      adminId: 'admin-1',
      reason: 'Falta condición',
    });
    const events = extractModerationAudit(cfg);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('CORRECTION_REQUIRED');
    expect(events[0].reason).toBe('Falta condición');
  });
});
