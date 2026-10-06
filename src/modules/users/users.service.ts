import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatRoomType, ProfileVisibility, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  AchievementProgressEntryDto,
  QuestProgressEntryDto,
  SyncGamificationDto,
  UserGamificationDto,
} from './dto/user-gamification.dto';
import { AccountDeletionService } from './account-deletion.service';

export const GAMIFICATION_SELECT = {
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountDeletion: AccountDeletionService,
  ) {}

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
    if (!isSelf) {
      const blocked = await this.prisma.userBlock.findFirst({
        where: {
          OR: [
            { initiatorId: viewerId, targetId },
            { initiatorId: targetId, targetId: viewerId },
          ],
        },
        select: { id: true },
      });
      if (blocked) {
        throw new NotFoundException('Usuario no encontrado');
      }
    }

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

  /** El usuario elimina su propia cuenta (AccountDeletionService: hard delete + limpieza completa). */
  async deleteOwnAccount(userId: string, password: string): Promise<{ deleted: true }> {
    const result = await this.accountDeletion.deleteOwnAccountWithPassword(userId, password);
    return { deleted: result.deleted };
  }

  /** Borra colección, historial, misiones/medallas, publicaciones y grafo social del usuario. */
  async wipeUserProgressData(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.placeVisit.deleteMany({ where: { userId } });
    await tx.placeReview.deleteMany({ where: { userId } });
    await tx.postLike.deleteMany({ where: { userId } });
    await tx.postCommentLike.deleteMany({ where: { userId } });
    await tx.feedPost.deleteMany({ where: { authorId: userId } });
    await tx.postComment.deleteMany({ where: { authorId: userId } });
    await tx.userDrinkUnlock.deleteMany({ where: { userId } });
    await tx.drinkHistoryEntry.deleteMany({ where: { userId } });
    await tx.userFavoriteDrink.deleteMany({ where: { userId } });
    await tx.userMission.deleteMany({ where: { userId } });
    await tx.userAchievement.deleteMany({ where: { userId } });
    await tx.userBarMissionProgress.deleteMany({ where: { userId } });
    await tx.userBarMedal.deleteMany({ where: { userId } });
    await tx.userGlobalEventProgress.deleteMany({ where: { userId } });
    await tx.userGlobalEventMedal.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.userPromotionActivation.deleteMany({ where: { userId } });
    // Limpieza de chat al eliminar cuenta:
    // - DIRECT: borrar sala completa (también elimina mensajes del otro lado).
    // - GROUP: borrar mensajes enviados por este usuario y su participación.
    // - Reads: eliminar marcas de lectura del usuario.
    const chatMemberships = await tx.chatParticipant.findMany({
      where: { userId },
      select: {
        roomId: true,
        room: { select: { type: true } },
      },
    });
    const directRoomIds = chatMemberships
      .filter((row) => row.room.type === ChatRoomType.DIRECT)
      .map((row) => row.roomId);
    if (directRoomIds.length > 0) {
      await tx.chatRoom.deleteMany({
        where: { id: { in: directRoomIds } },
      });
    }
    await tx.messageRead.deleteMany({ where: { userId } });
    await tx.messageReaction.deleteMany({ where: { userId } });
    await tx.chatMessage.deleteMany({ where: { senderId: userId } });
    await tx.chatParticipant.deleteMany({ where: { userId } });
    await tx.chatRoom.updateMany({
      where: { createdById: userId },
      data: { createdById: null },
    });
    // Soft-delete no dispara onDelete Cascade: al reactivar el mismo userId no deben volver contactos.
    await tx.friendship.deleteMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
    });
    await tx.friendRequest.deleteMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    });
    await tx.userBlock.deleteMany({
      where: { OR: [{ initiatorId: userId }, { targetId: userId }] },
    });
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
    const q = query?.trim() ?? '';
    if (q.length < 2) return [];
    const take = Math.min(Math.max(limit, 1), 30);
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        id: { not: excludeUserId },
        // Solo displayName — no filtrar/exponer por email (enumeración).
        displayName: { contains: q, mode: 'insensitive' },
      },
      take,
      select: { id: true, displayName: true, avatarUrl: true, isOnline: true },
    });
  }

  /** Snapshot mínimo para handshake Socket.IO (securityVersion). */
  async findAuthSecurity(userId: string): Promise<{ id: string; securityVersion: number } | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, securityVersion: true },
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

  /**
   * FASE 4.1: sync de progreso offline únicamente.
   * NO otorga XP: el cliente no es autoridad (ni con caps).
   * xpReward del payload se ignora; se conserva el valor servidor previo si existía.
   */
  private mergeQuestProgress(
    stored: QuestMap,
    incoming: QuestMap | undefined,
  ): QuestMap {
    if (!incoming || Object.keys(incoming).length === 0) {
      return stored;
    }
    const merged: QuestMap = { ...stored };
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

      if (incPeriod != null && (prevPeriod == null || incPeriod > prevPeriod)) {
        const progress = Math.max(0, Number(inc.progress ?? 0));
        const completedAt =
          inc.completedAt != null && Number(inc.completedAt) > 0
            ? Number(inc.completedAt)
            : null;
        merged[key] = {
          progress,
          completedAt,
          periodEpochDay: incPeriod,
          // No aceptar XP del cliente; conservar snapshot servidor si había.
          xpReward:
            prev.xpReward != null && Number(prev.xpReward) > 0
              ? Number(prev.xpReward)
              : undefined,
        };
        continue;
      }

      if (incPeriod != null && prevPeriod != null && incPeriod < prevPeriod) {
        continue;
      }

      const progress = Math.max(Number(prev.progress ?? 0), Number(inc.progress ?? 0));
      const completedAt = this.earliestMillis(prev.completedAt, inc.completedAt);
      merged[key] = {
        progress,
        completedAt: completedAt ?? null,
        periodEpochDay: incPeriod ?? prevPeriod ?? undefined,
        xpReward:
          prev.xpReward != null && Number(prev.xpReward) > 0
            ? Number(prev.xpReward)
            : undefined,
      };
    }
    return merged;
  }

  /**
   * FASE 4.1: sync de medallas offline sin XP cliente.
   * Unlock sin xpReward cliente: se acepta unlockedAt solo si ya estaba en servidor
   * o si el logro existe en catálogo backend (premia vía ledger aparte).
   */
  private mergeAchievementProgress(
    stored: AchievementMap,
    incoming: AchievementMap | undefined,
  ): AchievementMap {
    if (!incoming || Object.keys(incoming).length === 0) {
      return stored;
    }
    const merged: AchievementMap = { ...stored };
    for (const [key, inc] of Object.entries(incoming)) {
      if (!inc || typeof inc !== 'object') continue;
      const prev = stored[key] ?? {};
      const wasDone = prev.unlockedAt != null && Number(prev.unlockedAt) > 0;
      const progress = Math.max(Number(prev.progress ?? 0), Number(inc.progress ?? 0));
      const claimedUnlock = inc.unlockedAt != null && Number(inc.unlockedAt) > 0;
      let unlockedAt: number | null = wasDone
        ? this.earliestMillis(prev.unlockedAt, inc.unlockedAt)
        : null;
      // Rehidratación de progreso sin otorgar XP; unlock nuevo se marca para UX
      // pero el XP solo se acredita vía claimCatalogAchievementRewards.
      if (!wasDone && claimedUnlock) {
        unlockedAt = Number(inc.unlockedAt);
      }
      merged[key] = {
        progress,
        unlockedAt: unlockedAt ?? null,
        xpReward:
          prev.xpReward != null && Number(prev.xpReward) > 0
            ? Number(prev.xpReward)
            : undefined,
      };
    }
    return merged;
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

    next = await this.applyStreakBonusWithLedger(userId, next);

    return this.gamificationFromUser(next, await this.loadProgressMaps(userId));
  }

  /**
   * FASE 4.1 — sync offline de progreso.
   * Acepta: questProgress / achievementProgress (estado, sin XP cliente).
   * Acepta: dailyChestClaimedDay (solo día actual servidor → +50 coins ledger).
   * Ignora: coins, loginStreakDays, lastLoginEpochDay, streakBonusTierClaimed,
   *         xpReward/level del cliente.
   * XP/coins de catálogo backend: solo Mission/Achievement por slug + ledger.
   */
  async syncGamification(userId: string, payload: SyncGamificationDto): Promise<UserGamificationDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, ...GAMIFICATION_SELECT },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const storedProgress = await this.loadProgressMaps(userId);
    const hasQuestPayload = payload.questProgress != null;
    const hasAchievementPayload = payload.achievementProgress != null;
    const questMerged = hasQuestPayload
      ? this.mergeQuestProgress(storedProgress.questProgress, payload.questProgress)
      : storedProgress.questProgress;
    const achievementMerged = hasAchievementPayload
      ? this.mergeAchievementProgress(
          storedProgress.achievementProgress,
          payload.achievementProgress,
        )
      : storedProgress.achievementProgress;

    const data: Prisma.UserUpdateInput = {};
    // coins / streak / level: NO aceptados desde cliente (autoridad servidor).
    if (hasQuestPayload) {
      data.questProgress = questMerged as Prisma.InputJsonValue;
    }
    if (hasAchievementPayload) {
      data.achievementProgress = achievementMerged as Prisma.InputJsonValue;
    }

    let next: { id: string } & GamificationSlice =
      Object.keys(data).length === 0
        ? user
        : await this.prisma.user.update({
            where: { id: userId },
            data,
            select: { id: true, ...GAMIFICATION_SELECT },
          });

    // Cofre diario: máximo +50 coins/día UTC, idempotente por ledger.
    const claimedDay =
      payload.dailyChestClaimedDay != null && Number.isFinite(Number(payload.dailyChestClaimedDay))
        ? Math.max(0, Math.floor(Number(payload.dailyChestClaimedDay)))
        : null;
    const today = this.epochDay();
    if (claimedDay != null && claimedDay === today && claimedDay > next.dailyChestClaimedDay) {
      next = await this.grantRewardOnce(userId, next, {
        sourceType: 'DAILY_CHEST',
        sourceId: String(claimedDay),
        xp: 0,
        coins: 50,
        userPatch: { dailyChestClaimedDay: claimedDay },
      });
    }

    // Logros/misiones del catálogo backend (slug): XP servidor + ledger.
    next = await this.claimCatalogProgressRewards(userId, next, questMerged, achievementMerged);

    return this.gamificationFromUser(next, {
      questProgress: questMerged,
      achievementProgress: achievementMerged,
    });
  }

  private async applyStreakBonusWithLedger(
    userId: string,
    user: { id: string } & GamificationSlice,
  ): Promise<{ id: string } & GamificationSlice> {
    const tier = this.streakBonusTier(user.loginStreakDays);
    if (tier === 0 || tier <= user.streakBonusTierClaimed) return user;
    const bonusXp = tier === 3 ? 50 : tier === 7 ? 100 : tier === 14 ? 200 : 500;
    return this.grantRewardOnce(userId, user, {
      sourceType: 'STREAK_TIER',
      sourceId: String(tier),
      xp: bonusXp,
      coins: tier * 5,
      userPatch: { streakBonusTierClaimed: tier },
    });
  }

  /**
   * Premia solo keys que existen en Mission/Achievement (slug) con xpReward servidor.
   * Idempotente: UNIQUE(userId, sourceType, sourceId).
   */
  private async claimCatalogProgressRewards(
    userId: string,
    user: { id: string } & GamificationSlice,
    questProgress: QuestMap,
    achievementProgress: AchievementMap,
  ): Promise<{ id: string } & GamificationSlice> {
    let next = user;
    const questKeys = Object.entries(questProgress)
      .filter(([, v]) => v?.completedAt != null && Number(v.completedAt) > 0)
      .map(([k]) => k);
    const achievementKeys = Object.entries(achievementProgress)
      .filter(([, v]) => v?.unlockedAt != null && Number(v.unlockedAt) > 0)
      .map(([k]) => k);

    if (questKeys.length) {
      const missions = await this.prisma.mission.findMany({
        where: { slug: { in: questKeys }, deletedAt: null, isActive: true },
        select: { slug: true, xpReward: true },
      });
      for (const m of missions) {
        const entry = questProgress[m.slug];
        const period =
          entry?.periodEpochDay != null && Number.isFinite(Number(entry.periodEpochDay))
            ? String(Math.floor(Number(entry.periodEpochDay)))
            : 'once';
        next = await this.grantRewardOnce(userId, next, {
          sourceType: 'QUEST',
          sourceId: `${m.slug}:${period}`,
          xp: Math.max(0, m.xpReward),
          coins: 0,
        });
      }
    }

    if (achievementKeys.length) {
      const achievements = await this.prisma.achievement.findMany({
        where: { slug: { in: achievementKeys }, deletedAt: null },
        select: { slug: true, xpReward: true },
      });
      for (const a of achievements) {
        next = await this.grantRewardOnce(userId, next, {
          sourceType: 'ACHIEVEMENT',
          sourceId: a.slug,
          xp: Math.max(0, a.xpReward),
          coins: 0,
        });
      }
    }

    return next;
  }

  /**
   * Ledger idempotente UNIQUE(userId, sourceType, sourceId).
   * Si `tx` se pasa, NO abre $transaction anidada (FASE 6 medal unlock).
   * Sin `tx`, mantiene el comportamiento histórico con TX propia + soft P2002.
   */
  async grantRewardOnce(
    userId: string,
    user: { id: string } & GamificationSlice,
    grant: {
      sourceType: string;
      sourceId: string;
      xp: number;
      coins: number;
      userPatch?: Prisma.UserUpdateInput;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string } & GamificationSlice> {
    const xp = Math.max(0, grant.xp);
    const coins = Math.max(0, grant.coins);
    if (xp === 0 && coins === 0 && !grant.userPatch) return user;

    if (tx) {
      return this.applyGrantInTx(tx, userId, user, { ...grant, xp, coins });
    }

    try {
      return await this.prisma.$transaction(async (inner) =>
        this.applyGrantInTx(inner, userId, user, { ...grant, xp, coins }),
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Replay: ya premiado.
        return (
          (await this.prisma.user.findFirst({
            where: { id: userId },
            select: { id: true, ...GAMIFICATION_SELECT },
          })) ?? user
        );
      }
      throw err;
    }
  }

  private async applyGrantInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    user: { id: string } & GamificationSlice,
    grant: {
      sourceType: string;
      sourceId: string;
      xp: number;
      coins: number;
      userPatch?: Prisma.UserUpdateInput;
    },
  ): Promise<{ id: string } & GamificationSlice> {
    await tx.gamificationReward.create({
      data: {
        userId,
        sourceType: grant.sourceType,
        sourceId: grant.sourceId,
        xp: grant.xp,
        coins: grant.coins,
      },
    });
    const totalXp = user.totalXp + grant.xp;
    return tx.user.update({
      where: { id: userId },
      data: {
        ...(grant.userPatch ?? {}),
        ...(grant.xp > 0
          ? { totalXp, level: this.levelFromTotalXp(totalXp) }
          : {}),
        ...(grant.coins > 0 ? { coins: { increment: grant.coins } } : {}),
      },
      select: { id: true, ...GAMIFICATION_SELECT },
    });
  }
}
