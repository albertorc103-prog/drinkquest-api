import { buildRooftopUserFeedWhere } from './rooftop-feed.where';

describe('buildRooftopUserFeedWhere', () => {
  const now = new Date('2026-10-20T15:00:00.000Z');

  it('incluye paquetes aprobados con inicio futuro si aún no vencen', () => {
    const where = buildRooftopUserFeedWhere(now);
    expect(where).toMatchObject({
      approvalStatus: 'APPROVED',
      status: 'ACTIVE',
      endsAt: { gt: now },
    });
    expect(where).not.toHaveProperty('startsAt');
  });
});
