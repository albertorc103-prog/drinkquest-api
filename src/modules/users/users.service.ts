import { Injectable, NotFoundException } from '@nestjs/common';
import { ProfileVisibility, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SyncGamificationDto, UserGamificationDto } from './dto/user-gamification.dto';

const GAMIFICATION_SELECT = {
  coins: true,
  loginStreakDays: true,
  lastLoginEpochDay: true,
  streakBonusTierClaimed: true,
  dailyChestClaimedDay: true,
  totalXp: true,
  level: true,
} as const;

type GamificationSlice = Pick<User, keyof typeof GAMIFICATION_SELECT>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string, viewerId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        profileVisibility: true,
        isOnline: true,
        emailVerified: true,
        createdAt: true,
        ...GAMIFICATION_SELECT,
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.profileVisibility === ProfileVisibility.PRIVATE && userId !== viewerId) {
      return { id: user.id, displayName: user.displayName, profileVisibility: 'PRIVATE' };
    }
    return user;
  }

  async updateProfile(userId: string, data: { displayName?: string; bio?: string; profileVisibility?: ProfileVisibility }) {
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
  }

  async search(query: string, excludeUserId: string, limit = 20) {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        id: { not: excludeUserId },
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: { id: true, displayName: true, avatarUrl: true, isOnline: true },
    });
  }

  async setOnline(userId: string, online: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isOnline: online, lastSeenAt: online ? undefined : new Date() },
    });
  }

  /** Día juliano UTC (compatible con java.time.LocalDate.toEpochDay()). */
  private epochDay(date = new Date()): number {
    const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return Math.floor(utc / 86_400_000);
  }

  private gamificationFromUser(user: Pick<User, keyof typeof GAMIFICATION_SELECT>): UserGamificationDto {
    return {
      coins: user.coins,
      loginStreakDays: user.loginStreakDays,
      lastLoginEpochDay: user.lastLoginEpochDay,
      streakBonusTierClaimed: user.streakBonusTierClaimed,
      dailyChestClaimedDay: user.dailyChestClaimedDay,
      totalXp: user.totalXp,
      level: user.level,
    };
  }

  private levelFromTotalXp(totalXp: number): number {
    let remaining = Math.max(0, totalXp);
    let level = 1;
    while (level < 50) {
      const need = 180 + (level - 1) * 40;
      if (remaining < need) return level;
      remaining -= need;
      level += 1;
    }
    return 50;
  }

  private streakBonusTier(streakDays: number): number {
    if (streakDays >= 30) return 30;
    if (streakDays >= 14) return 14;
    if (streakDays >= 7) return 7;
    if (streakDays >= 3) return 3;
    return 0;
  }

  private applyStreakBonus(user: GamificationSlice): {
    coins: number;
    streakBonusTierClaimed: number;
    totalXp: number;
    level: number;
  } {
    const tier = this.streakBonusTier(user.loginStreakDays);
    if (tier === 0 || tier <= user.streakBonusTierClaimed) {
      return {
        coins: user.coins,
        streakBonusTierClaimed: user.streakBonusTierClaimed,
        totalXp: user.totalXp,
        level: user.level,
      };
    }
    const bonusXp = tier === 3 ? 50 : tier === 7 ? 100 : tier === 14 ? 200 : 500;
    const totalXp = user.totalXp + bonusXp;
    return {
      coins: user.coins + tier * 5,
      streakBonusTierClaimed: tier,
      totalXp,
      level: this.levelFromTotalXp(totalXp),
    };
  }

  async recordDailyLogin(userId: string): Promise<UserGamificationDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, ...GAMIFICATION_SELECT },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const today = this.epochDay();
    let next = user;
    if (user.lastLoginEpochDay !== today) {
      const streak =
        user.lastLoginEpochDay === today - 1 ? user.loginStreakDays + 1 : 1;
      next = await this.prisma.user.update({
        where: { id: userId },
        data: { lastLoginEpochDay: today, loginStreakDays: streak },
        select: { id: true, ...GAMIFICATION_SELECT },
      });
    }

    const bonus = this.applyStreakBonus(next);
    if (
      bonus.coins !== next.coins ||
      bonus.streakBonusTierClaimed !== next.streakBonusTierClaimed ||
      bonus.totalXp !== next.totalXp
    ) {
      next = await this.prisma.user.update({
        where: { id: userId },
        data: bonus,
        select: { id: true, ...GAMIFICATION_SELECT },
      });
    }

    return this.gamificationFromUser(next);
  }

  async syncGamification(userId: string, payload: SyncGamificationDto): Promise<UserGamificationDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, ...GAMIFICATION_SELECT },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const data: Prisma.UserUpdateInput = {};
    if (payload.coins != null) {
      data.coins = Math.max(user.coins, payload.coins);
    }
    if (payload.loginStreakDays != null) {
      data.loginStreakDays = Math.max(user.loginStreakDays, payload.loginStreakDays);
    }
    if (payload.lastLoginEpochDay != null) {
      data.lastLoginEpochDay = Math.max(user.lastLoginEpochDay, payload.lastLoginEpochDay);
    }
    if (payload.streakBonusTierClaimed != null) {
      data.streakBonusTierClaimed = Math.max(
        user.streakBonusTierClaimed,
        payload.streakBonusTierClaimed,
      );
    }
    if (payload.dailyChestClaimedDay != null) {
      data.dailyChestClaimedDay = Math.max(
        user.dailyChestClaimedDay,
        payload.dailyChestClaimedDay,
      );
    }

    const updated =
      Object.keys(data).length === 0
        ? user
        : await this.prisma.user.update({
            where: { id: userId },
            data,
            select: { id: true, ...GAMIFICATION_SELECT },
          });

    return this.gamificationFromUser(updated);
  }
}
