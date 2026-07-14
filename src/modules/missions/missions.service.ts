import { BadRequestException, Injectable } from '@nestjs/common';
import { MissionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listForUser(userId: string) {
    const missions = await this.prisma.mission.findMany({ where: { isActive: true, deletedAt: null } });
    const progress = await this.prisma.userMission.findMany({ where: { userId } });
    const map = new Map(progress.map((p) => [p.missionId, p]));
    return missions.map((m) => ({
      mission: m,
      userMission: map.get(m.id) ?? null,
    }));
  }

  async increment(userId: string, triggerKey: string, amount = 1) {
    const missions = await this.prisma.mission.findMany({
      where: { triggerKey, isActive: true, deletedAt: null },
    });
    for (const mission of missions) {
      const existing = await this.prisma.userMission.findUnique({
        where: { userId_missionId: { userId, missionId: mission.id } },
      });
      if (
        existing?.status === MissionStatus.COMPLETED ||
        existing?.status === MissionStatus.CLAIMED
      ) {
        continue;
      }

      const row = await this.prisma.userMission.upsert({
        where: { userId_missionId: { userId, missionId: mission.id } },
        create: { userId, missionId: mission.id, status: MissionStatus.IN_PROGRESS, progress: amount },
        update: { progress: { increment: amount } },
      });
      if (row.progress >= mission.targetCount && row.status !== MissionStatus.COMPLETED) {
        await this.prisma.userMission.update({
          where: { id: row.id },
          data: { status: MissionStatus.COMPLETED, completedAt: new Date() },
        });
        await this.prisma.user.update({
          where: { id: userId },
          data: { totalXp: { increment: mission.xpReward } },
        });
        await this.notifications.create(
          userId,
          NotificationType.MISSION_COMPLETE,
          'Misión completada',
          mission.title,
        );
      }
    }
  }

  async onQrUnlock(userId: string) {
    await this.increment(userId, 'qr_unlock', 1);
    await this.increment(userId, 'first_unlock', 1);
  }

  async claim(userId: string, missionId: string) {
    const um = await this.prisma.userMission.findUnique({
      where: { userId_missionId: { userId, missionId } },
    });
    if (!um || um.status !== MissionStatus.COMPLETED) {
      throw new BadRequestException('Misión no completada');
    }
    return this.prisma.userMission.update({
      where: { id: um.id },
      data: { status: MissionStatus.CLAIMED, claimedAt: new Date() },
    });
  }

  async achievements(userId: string) {
    return this.prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
    });
  }
}
