import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ProfileVisibility, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { verifyPassword } from '../../common/utils/crypto.util';
import {
  AchievementProgressEntryDto,
  QuestProgressEntryDto,
  SyncGamificationDto,
  UserGamificationDto,
} from './dto/user-gamification.dto';

const GAMIFICATION_SELECT = {
  coins: true,
  loginStreakDays: true,
  lastLoginEpochDay: true,
  streakBonusTierClaimed: true,
  dailyChestClaimedDay: true,
  totalXp: true,
  level: true,
} as const;

const PROFILE_SELECT = {
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
} as const;

const PROGRESS_SELECT = {
  questProgress: true,
  achievementProgress: true,
} as const;

type GamificationSlice = Pick<User, keyof typeof GAMIFICATION_SELECT>;

type QuestMap = Record<string, QuestProgressEntryDto>;
type AchievementMap = Record<string, AchievementProgressEntryDto>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string, viewerId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        ...PROFILE_SELECT,
        createdAt: true,
        questProgress: true,
        achievementProgress: true,
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const isSelf = !!viewerId && userId === viewerId;
    const isFriend = isSelf ? true : viewerId ? await this.areFriends(userId, viewerId) : false;
    if (user.profileVisibility === ProfileVisibility.PRIVATE && !isSelf && !isFriend) {
      return { id: user.id, displayName: user.displayName, profileVisibility: 'PRIVATE' };
    }

    const questMap = this.asQuestMap(user.questProgress);
    const achievementMap = this.asAchievementMap(user.achievementProgress);
    const social = await this.buildSocialExtras(userId, questMap, achievementMap);

    const { questProgress: _q, achievementProgress: _a, createdAt, ...rest } = user;
    return {
      ...rest,
      createdAt: createdAt.toISOString(),
      questProgress: questMap,
      achievementProgress: achievementMap,
      ...social,
    };
  }

  async getSocialProfile(targetId: string, viewerId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: targetId, deletedAt: null },
      select: {
        ...PROFILE_SELECT,
        createdAt: true,
        questProgress: true,
        achievementProgress: true,
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const isSelf = targetId === viewerId;
    const isFriend = isSelf ? true : await this.areFriends(targetId, viewerId);
    if (user.profileVisibility === ProfileVisibility.PRIVATE && !isSelf && !isFriend) {
      return {
        id: user.id,
        displayName: user.displayName,
        profileVisibility: 'PRIVATE',
        isPrivate: true,
      };
    }

    const questMap = this.asQuestMap(user.questProgress);
    const achievementMap = this.asAchievementMap(user.achievementProgress);
    const social = await this.buildSocialExtras(targetId, questMap, achievementMap);

    return {
      id: user.id,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      profileVisibility: user.profileVisibility,
      isOnline: user.isOnline,
      totalXp: user.totalXp,
      level: user.level,
      createdAt: user.createdAt.toISOString(),
      isPrivate: false,
      questProgress: questMap,
      achievementProgress: achievementMap,
      ...social,
    };
  }

  /** Contadores + actividad reciente (bebidas / misiones / medallas). */
  private async buildSocialExtras(
    userId: string,
    questMap: QuestMap,
    achievementMap: AchievementMap,
  ) {
    const [drinkCount, medalsDb, completedMissionsDb, recentHistory, recentUnlocks, featuredMedalsDb] =
      await Promise.all([
        this.prisma.userDrinkUnlock.count({ where: { userId } }),
        this.prisma.userAchievement.count({ where: { userId } }),
        this.prisma.userMission.count({
          where: {
            userId,
            OR: [
              { completedAt: { not: null } },
              { status: { in: ['COMPLETED', 'CLAIMED'] } },
            ],
          },
        }),
        this.prisma.drinkHistoryEntry.findMany({
          where: { userId },
          orderBy: { loggedAt: 'desc' },
          take: 8,
          include: { drink: { select: { name: true } } },
        }),
        this.prisma.userDrinkUnlock.findMany({
          where: { userId },
          orderBy: { unlockedAt: 'desc' },
          take: 8,
          include: { drink: { select: { name: true } } },
        }),
        this.prisma.userAchievement.findMany({
          where: { userId },
          orderBy: { unlockedAt: 'desc' },
          take: 5,
          include: {
            achievement: {
              select: {
                slug: true,
                title: true,
                description: true,
                iconKey: true,
                xpReward: true,
                triggerKey: true,
              },
            },
          },
        }),
      ]);

    const completedFromJson = Object.values(questMap).filter((q) => !!q.completedAt).length;
    const completedMissionsCount = Math.max(completedMissionsDb, completedFromJson);

    const medalsFromJson = Object.values(achievementMap).filter((a) => !!a.unlockedAt).length;
    const medalsCount = Math.max(medalsDb, medalsFromJson);

    const recentAchievementProgress = Object.entries(achievementMap)
      .filter(([, v]) => !!v.unlockedAt || (v.progress ?? 0) > 0)
      .sort((a, b) => (b[1].unlockedAt ?? 0) - (a[1].unlockedAt ?? 0))
      .slice(0, 6)
      .map(([key, v]) => ({
        key,
        progress: v.progress ?? 0,
        unlockedAt: v.unlockedAt ?? null,
        xpReward: v.xpReward ?? 0,
      }));

    let featuredMedals = featuredMedalsDb.map((m) => ({
      slug: m.achievement.slug,
      title: m.achievement.title,
      description: m.achievement.description,
      iconKey: m.achievement.iconKey,
      triggerKey: m.achievement.triggerKey,
      xpReward: m.achievement.xpReward,
      unlockedAt: m.unlockedAt.toISOString(),
    }));

    // Si no hay filas en user_achievements, armar destacadas desde el snapshot JSON.
    if (featuredMedals.length === 0) {
      featuredMedals = Object.entries(achievementMap)
        .filter(([, v]) => !!v.unlockedAt)
        .sort((a, b) => (b[1].unlockedAt ?? 0) - (a[1].unlockedAt ?? 0))
        .slice(0, 5)
        .map(([key, v]) => ({
          slug: key,
          title: key.replace(/_/g, ' '),
          description: '',
          iconKey: key,
          triggerKey: key,
          xpReward: v.xpReward ?? 0,
          unlockedAt: v.unlockedAt ? new Date(v.unlockedAt).toISOString() : new Date().toISOString(),
        }));
    }

    const recentDrinks =
      recentHistory.length > 0
        ? recentHistory.map((h) => ({
            drinkName: h.drink.name,
            placeName: 'Registro',
            rating: h.rating ?? 0,
            loggedAt: h.loggedAt.toISOString(),
          }))
        : recentUnlocks.map((u) => ({
            drinkName: u.drink.name,
            placeName: 'Desbloqueo',
            rating: 8,
            loggedAt: u.unlockedAt.toISOString(),
          }));

    return {
      drinkCount,
      medalsCount,
      completedMissionsCount,
      recentDrinks,
      featuredMedals,
      recentAchievementProgress,
    };
  }

  private async areFriends(a: string, b: string): Promise<boolean> {
    const [userAId, userBId] = a < b ? [a, b] : [b, a];
    const f = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });
    return !!f;
  }

  /** Perfil propio con snapshot de misiones/medallas (users/me). */
  async getOwnProfileWithProgress(userId: string) {
    const profile = await this.getProfile(userId, userId);
    if (!('email' in profile)) return profile;
    const progress = await this.loadProgressMaps(userId);
    return {
      ...profile,
      questProgress: progress.questProgress,
      achievementProgress: progress.achievementProgress,
    };
  }

  private async loadProgressMaps(userId: string): Promise<{
    questProgress: QuestMap;
    achievementProgress: AchievementMap;
  }> {
    try {
      const row = await this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: PROGRESS_SELECT,
      });
      return {
        questProgress: this.asQuestMap(row?.questProgress),
        achievementProgress: this.asAchievementMap(row?.achievementProgress),
      };
    } catch {
      // Columnas aún no migradas en el entorno: no tumbar auth/perfil.
      return { questProgress: {}, achievementProgress: {} };
    }
  }

  /** El usuario elimina su propia cuenta: verifica contraseña, soft delete + revocación de sesiones. */
  async deleteOwnAccount(userId: string, password: string): Promise<{ deleted: true }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const plain = password?.trim() ?? '';
    if (!plain || !(await verifyPassword(plain, user.passwordHash))) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.deviceToken.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: now, isOnline: false },
      }),
    ]);
    return { deleted: true };
  }

  async updateProfile(
    userId: string,
    data: {
      displayName?: string;
      bio?: string | null;
      avatarUrl?: string | null;
      profileVisibility?: ProfileVisibility;
    },
  ) {
    const patch: Prisma.UserUpdateInput = {};
    if (data.displayName !== undefined) {
      const name = data.displayName.trim();
      if (!name) throw new BadRequestException('El nombre es obligatorio.');
      patch.displayName = name;
    }
    if (data.bio !== undefined) {
      patch.bio = data.bio?.trim() ? data.bio.trim() : null;
    }
    if (data.avatarUrl !== undefined) {
      patch.avatarUrl = data.avatarUrl?.trim() ? data.avatarUrl.trim() : null;
    }
    if (data.profileVisibility !== undefined) {
      patch.profileVisibility = data.profileVisibility;
    }
    if (Object.keys(patch).length === 0) {
      return this.getOwnProfileWithProgress(userId);
    }
    await this.prisma.user.update({ where: { id: userId }, data: patch });
    return this.getOwnProfileWithProgress(userId);
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
      data: {
        isOnline: online,
        // Siempre refresca actividad (conexión o desconexión).
        lastSeenAt: new Date(),
      },
    });
  }

  /** Expone el cálculo de nivel para otros módulos (QR, amigos, etc.). */
  levelFromXp(totalXp: number): number {
    return this.levelFromTotalXp(totalXp);
  }

  /** Día juliano UTC (compatible con java.time.LocalDate.toEpochDay()). */
  private epochDay(date = new Date()): number {
    const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return Math.floor(utc / 86_400_000);
  }

  private asQuestMap(raw: unknown): QuestMap {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as QuestMap;
  }

  private asAchievementMap(raw: unknown): AchievementMap {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as AchievementMap;
  }

  private gamificationFromUser(
    user: GamificationSlice,
    progress?: { questProgress: QuestMap; achievementProgress: AchievementMap },
  ): UserGamificationDto {
    return {
      coins: user.coins,
      loginStreakDays: user.loginStreakDays,
      lastLoginEpochDay: user.lastLoginEpochDay,
      streakBonusTierClaimed: user.streakBonusTierClaimed,
      dailyChestClaimedDay: user.dailyChestClaimedDay,
      totalXp: user.totalXp,
      level: user.level,
      questProgress: progress?.questProgress ?? {},
      achievementProgress: progress?.achievementProgress ?? {},
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

  private mergeQuestProgress(
    stored: QuestMap,
    incoming: QuestMap | undefined,
  ): { merged: QuestMap; xpGained: number } {
    if (!incoming || Object.keys(incoming).length === 0) {
      return { merged: stored, xpGained: 0 };
    }
    const merged: QuestMap = { ...stored };
    let xpGained = 0;
    for (const [key, inc] of Object.entries(incoming)) {
      if (!inc || typeof inc !== 'object') continue;
      const prev = stored[key] ?? {};
      const prevPeriod =
        prev.periodEpochDay != null && Number.isFinite(Number(prev.periodEpochDay))
          ? Number(prev.periodEpochDay)
          : null;
      const incPeriod =
        inc.periodEpochDay != null && Number.isFinite(Number(inc.periodEpochDay))
          ? Number(inc.periodEpochDay)
          : null;

      // Periodo nuevo (diaria/semanal): el cliente manda el snapshot del periodo actual
      // (puede ser progress 0 / completedAt null tras reset).
      if (incPeriod != null && (prevPeriod == null || incPeriod > prevPeriod)) {
        const wasDone = prev.completedAt != null && Number(prev.completedAt) > 0;
        const progress = Math.max(0, Number(inc.progress ?? 0));
        const completedAt =
          inc.completedAt != null && Number(inc.completedAt) > 0
            ? Number(inc.completedAt)
            : null;
        const incomingXp =
          inc.xpReward != null && Number.isFinite(Number(inc.xpReward))
            ? Math.max(0, Number(inc.xpReward))
            : 0;
        const xpReward = Math.max(incomingXp, Number(prev.xpReward ?? 0));
        merged[key] = {
          progress,
          completedAt,
          periodEpochDay: incPeriod,
          xpReward: xpReward > 0 ? xpReward : undefined,
        };
        // Migración (sin periodEpochDay previo pero ya completada): sellar periodo sin re-premiar.
        // Premiar solo con xpReward explícito del cliente (completación real / rollover).
        if (completedAt != null && incomingXp > 0) {
          const isPeriodMigration = prevPeriod == null && wasDone;
          const isRealPeriodRollover = prevPeriod != null && incPeriod > prevPeriod;
          const isFirstCompletion = !wasDone;
          if (!isPeriodMigration && (isFirstCompletion || isRealPeriodRollover)) {
            xpGained += incomingXp;
          }
        }
        continue;
      }

      // Incoming de un periodo más viejo: ignorar.
      if (incPeriod != null && prevPeriod != null && incPeriod < prevPeriod) {
        continue;
      }

      const wasDone = prev.completedAt != null && Number(prev.completedAt) > 0;
      const progress = Math.max(Number(prev.progress ?? 0), Number(inc.progress ?? 0));
      const completedAt = this.earliestMillis(prev.completedAt, inc.completedAt);
      const incomingXp =
        inc.xpReward != null && Number.isFinite(Number(inc.xpReward))
          ? Math.max(0, Number(inc.xpReward))
          : 0;
      const xpReward = Math.max(Number(prev.xpReward ?? 0), incomingXp);
      merged[key] = {
        progress,
        completedAt: completedAt ?? null,
        periodEpochDay: incPeriod ?? prevPeriod ?? undefined,
        xpReward: xpReward > 0 ? xpReward : undefined,
      };
      const nowDone = completedAt != null && completedAt > 0;
      if (!wasDone && nowDone && incomingXp > 0) {
        xpGained += incomingXp;
      }
    }
    return { merged, xpGained };
  }

  private mergeAchievementProgress(
    stored: AchievementMap,
    incoming: AchievementMap | undefined,
  ): { merged: AchievementMap; xpGained: number } {
    if (!incoming || Object.keys(incoming).length === 0) {
      return { merged: stored, xpGained: 0 };
    }
    const merged: AchievementMap = { ...stored };
    let xpGained = 0;
    for (const [key, inc] of Object.entries(incoming)) {
      if (!inc || typeof inc !== 'object') continue;
      const prev = stored[key] ?? {};
      const wasDone = prev.unlockedAt != null && Number(prev.unlockedAt) > 0;
      const progress = Math.max(Number(prev.progress ?? 0), Number(inc.progress ?? 0));
      const unlockedAt = this.earliestMillis(prev.unlockedAt, inc.unlockedAt);
      const incomingXp =
        inc.xpReward != null && Number.isFinite(Number(inc.xpReward))
          ? Math.max(0, Number(inc.xpReward))
          : 0;
      const xpReward = Math.max(Number(prev.xpReward ?? 0), incomingXp);
      merged[key] = {
        progress,
        unlockedAt: unlockedAt ?? null,
        xpReward: xpReward > 0 ? xpReward : undefined,
      };
      const nowDone = unlockedAt != null && unlockedAt > 0;
      // Solo premiar si el cliente manda xpReward (completación real, no rehidratación).
      if (!wasDone && nowDone && incomingXp > 0) {
        xpGained += incomingXp;
      }
    }
    return { merged, xpGained };
  }

  private earliestMillis(a: number | null | undefined, b: number | null | undefined): number | null {
    const av = a != null && Number(a) > 0 ? Number(a) : null;
    const bv = b != null && Number(b) > 0 ? Number(b) : null;
    if (av == null) return bv;
    if (bv == null) return av;
    return Math.min(av, bv);
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

    return this.gamificationFromUser(next, await this.loadProgressMaps(userId));
  }

  async syncGamification(userId: string, payload: SyncGamificationDto): Promise<UserGamificationDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, ...GAMIFICATION_SELECT },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const storedProgress = await this.loadProgressMaps(userId);
    const questMerge = this.mergeQuestProgress(
      storedProgress.questProgress,
      payload.questProgress,
    );
    const achievementMerge = this.mergeAchievementProgress(
      storedProgress.achievementProgress,
      payload.achievementProgress,
    );
    const progressXp = questMerge.xpGained + achievementMerge.xpGained;

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

    const hasQuestPayload = payload.questProgress != null;
    const hasAchievementPayload = payload.achievementProgress != null;
    if (hasQuestPayload) {
      data.questProgress = questMerge.merged as Prisma.InputJsonValue;
    }
    if (hasAchievementPayload) {
      data.achievementProgress = achievementMerge.merged as Prisma.InputJsonValue;
    }
    if (progressXp > 0) {
      const totalXp = user.totalXp + progressXp;
      data.totalXp = totalXp;
      data.level = this.levelFromTotalXp(totalXp);
    }

    const updated =
      Object.keys(data).length === 0
        ? user
        : await this.prisma.user.update({
            where: { id: userId },
            data,
            select: { id: true, ...GAMIFICATION_SELECT },
          });

    return this.gamificationFromUser(updated, {
      questProgress: hasQuestPayload ? questMerge.merged : storedProgress.questProgress,
      achievementProgress: hasAchievementPayload
        ? achievementMerge.merged
        : storedProgress.achievementProgress,
    });
  }
}
