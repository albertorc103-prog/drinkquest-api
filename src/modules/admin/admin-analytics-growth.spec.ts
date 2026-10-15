import { AdminService } from './admin.service';

describe('AdminService.growthAnalytics', () => {
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(5) },
    bar: { count: jest.fn().mockResolvedValue(2) },
  };
  const users = { wipeUserProgressData: jest.fn() };
  const service = new AdminService(prisma as never, users as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns range 12m with monthly points', async () => {
    const result = await service.growthAnalytics('12m');
    expect(result.range).toBe('12m');
    expect(result.points).toHaveLength(12);
    expect(result.points[0]).toMatchObject({ label: expect.any(String), users: 5, bars: 2 });
  });

  it('returns range 7d with daily points', async () => {
    const result = await service.growthAnalytics('7d');
    expect(result.range).toBe('7d');
    expect(result.points).toHaveLength(7);
  });

  it('defaults unknown range to 6m', async () => {
    const result = await service.growthAnalytics('invalid');
    expect(result.range).toBe('6m');
    expect(result.points).toHaveLength(6);
  });
});
