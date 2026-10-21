/** Suscripción Legend vigente para mocks de progreso/desbloqueo en tests. */
export const legendBarSubscriptionFindUniqueMock = () => ({
  findUnique: jest.fn(async () => ({
    plan: 'LEGEND',
    status: 'ACTIVE',
    trialEndsAt: null,
    currentPeriodEnd: new Date('2030-01-01T00:00:00Z'),
    canceledAt: null,
    qrEnabled: true,
    promoEnabled: true,
  })),
});
