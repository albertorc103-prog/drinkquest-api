import { FeedService } from './feed.service';

describe('FeedService block filter FASE 4.1', () => {
  it('TEST 11/12: excluye autores bloqueados bidireccional antes de paginar', async () => {
    const posts = [
      { id: 'p1', authorId: 'a', deletedAt: null, createdAt: new Date('2026-01-03'), type: 'POST', imageUrl: null, meta: null, _count: { likes: 0, comments: 0 } },
      { id: 'p2', authorId: 'b', deletedAt: null, createdAt: new Date('2026-01-02'), type: 'POST', imageUrl: null, meta: null, _count: { likes: 0, comments: 0 } },
      { id: 'p3', authorId: 'c', deletedAt: null, createdAt: new Date('2026-01-01'), type: 'POST', imageUrl: null, meta: null, _count: { likes: 0, comments: 0 } },
    ];
    const prisma: any = {
      userBlock: {
        findMany: jest.fn(async () => [
          { initiatorId: 'viewer', targetId: 'b' },
          { initiatorId: 'c', targetId: 'viewer' },
        ]),
      },
      feedPost: {
        findMany: jest.fn(async ({ where, take, skip }: any) => {
          let rows = posts.filter((p) => !p.deletedAt);
          if (where.authorId?.notIn) {
            rows = rows.filter((p) => !where.authorId.notIn.includes(p.authorId));
          }
          return rows
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(skip, skip + take)
            .map((p) => ({ ...p, author: { id: p.authorId, displayName: p.authorId, avatarUrl: null } }));
        }),
        count: jest.fn(async ({ where }: any) => {
          let rows = posts.filter((p) => !p.deletedAt);
          if (where.authorId?.notIn) {
            rows = rows.filter((p) => !where.authorId.notIn.includes(p.authorId));
          }
          return rows.length;
        }),
      },
      drink: { findMany: jest.fn(async () => []) },
    };
    const service = new FeedService(prisma, {} as any, {} as any);
    const page = await service.feed(1, 20, 'viewer');
    expect(page.items.map((i: any) => i.id)).toEqual(['p1']);
    expect(page.total).toBe(1);
    expect(prisma.feedPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          authorId: { notIn: expect.arrayContaining(['b', 'c']) },
        }),
      }),
    );
  });

  it('TEST 13: paginación sobre posts visibles', async () => {
    const posts = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      authorId: i % 2 === 0 ? 'ok' : 'blocked',
      deletedAt: null,
      createdAt: new Date(2026, 0, 10 - i),
      type: 'POST',
      imageUrl: null,
      meta: null,
      _count: { likes: 0, comments: 0 },
    }));
    const prisma: any = {
      userBlock: {
        findMany: jest.fn(async () => [{ initiatorId: 'viewer', targetId: 'blocked' }]),
      },
      feedPost: {
        findMany: jest.fn(async ({ where, take, skip }: any) => {
          let rows = posts.filter((p) => !p.deletedAt);
          if (where.authorId?.notIn) {
            rows = rows.filter((p) => !where.authorId.notIn.includes(p.authorId));
          }
          return rows
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(skip, skip + take)
            .map((p) => ({ ...p, author: { id: p.authorId, displayName: 'n', avatarUrl: null } }));
        }),
        count: jest.fn(async ({ where }: any) => {
          let rows = posts.filter((p) => !p.deletedAt);
          if (where.authorId?.notIn) {
            rows = rows.filter((p) => !where.authorId.notIn.includes(p.authorId));
          }
          return rows.length;
        }),
      },
      drink: { findMany: jest.fn(async () => []) },
    };
    const service = new FeedService(prisma, {} as any, {} as any);
    const page = await service.feed(1, 2, 'viewer');
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
    expect(page.items.every((i: any) => i.authorId === 'ok')).toBe(true);
  });
});
