import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { FriendsService } from '../friends/friends.service';

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
  ) {}

  async list(userId: string, scope: 'global' | 'friends', limit = 50) {
    let users: Array<{
      id: string;
      displayName: string;
      avatarUrl: string | null;
      totalXp: number;
      level: number;
    }>;

    if (scope === 'friends') {
      const friendRows = await this.friends.listFriends(userId);
      const ids = Array.from(new Set([userId, ...friendRows.map((f) => f.id)]));
      users = await this.prisma.user.findMany({
        where: { id: { in: ids }, deletedAt: null, role: 'USER' },
        orderBy: [{ totalXp: 'desc' }, { displayName: 'asc' }],
        take: limit,
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          totalXp: true,
          level: true,
        },
      });
    } else {
      users = await this.prisma.user.findMany({
        where: { deletedAt: null, role: 'USER' },
        orderBy: [{ totalXp: 'desc' }, { displayName: 'asc' }],
        take: limit,
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          totalXp: true,
          level: true,
        },
      });
    }

    const entries = users.map((u, index) => ({
      rank: index + 1,
      userId: u.id,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      totalXp: u.totalXp,
      level: u.level,
      isCurrentUser: u.id === userId,
    }));

    const me = entries.find((e) => e.isCurrentUser);
    const myXp =
      me?.totalXp ??
      (
        await this.prisma.user.findUnique({
          where: { id: userId },
          select: { totalXp: true },
        })
      )?.totalXp ??
      0;

    let userRank = me?.rank ?? null;
    if (userRank == null && scope === 'global') {
      const higher = await this.prisma.user.count({
        where: {
          deletedAt: null,
          role: 'USER',
          totalXp: { gt: myXp },
        },
      });
      userRank = higher + 1;
    }

    return {
      scope,
      entries,
      userRank,
      userXp: myXp,
    };
  }
}
