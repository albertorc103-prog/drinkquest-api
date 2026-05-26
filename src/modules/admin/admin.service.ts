import { Injectable } from '@nestjs/common';
import { ReportStatus, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async analytics() {
    const [users, bars, unlocks, reports] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.bar.count({ where: { deletedAt: null } }),
      this.prisma.userDrinkUnlock.count(),
      this.prisma.report.count({ where: { status: ReportStatus.OPEN } }),
    ]);
    return { users, bars, unlocks, openReports: reports };
  }

  async listUsers(page = 1, limit = 50) {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    });
  }

  async listBars() {
    return this.prisma.bar.findMany({
      where: { deletedAt: null },
      include: { owner: { select: { email: true, displayName: true } } },
    });
  }

  async listReports(status?: ReportStatus) {
    return this.prisma.report.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async resolveReport(id: string, status: ReportStatus, adminNotes?: string) {
    return this.prisma.report.update({ where: { id }, data: { status, adminNotes } });
  }

  async setUserRole(userId: string, role: Role) {
    return this.prisma.user.update({ where: { id: userId }, data: { role } });
  }

  async softDeleteUser(userId: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
  }
}
