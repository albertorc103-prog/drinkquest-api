import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReportStatus, ReportTargetType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const ALLOWED_REASONS = new Set([
  'SPAM',
  'HARASSMENT',
  'INAPPROPRIATE_CONTENT',
  'IMPERSONATION',
  'OTHER',
]);

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    reporterId: string,
    input: {
      targetType: string;
      targetUserId?: string;
      targetPostId?: string;
      targetReviewId?: string;
      targetMessageId?: string;
      reason: string;
      details?: string;
    },
  ) {
    const targetType = normalizeTargetType(input.targetType);
    if (!targetType) {
      throw new BadRequestException('Tipo de reporte no válido.');
    }
    const reason = (input.reason ?? '').trim().toUpperCase();
    if (!ALLOWED_REASONS.has(reason)) {
      throw new BadRequestException('Motivo de reporte no válido.');
    }
    const details = input.details?.trim()?.slice(0, 500) || null;
    const reasonText = details ? `${reason}: ${details}` : reason;

    if (targetType === ReportTargetType.USER) {
      const targetUserId = input.targetUserId?.trim();
      if (!targetUserId) throw new BadRequestException('targetUserId requerido.');
      if (targetUserId === reporterId) {
        throw new BadRequestException('No puedes reportarte a ti mismo.');
      }
      const user = await this.prisma.user.findFirst({
        where: { id: targetUserId, deletedAt: null },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('Usuario no encontrado.');

      await this.assertNoOpenDup(reporterId, {
        targetType: ReportTargetType.USER,
        targetUserId,
      });

      return this.prisma.report.create({
        data: {
          reporterId,
          targetType: ReportTargetType.USER,
          targetUserId,
          reason: reasonText,
          status: ReportStatus.OPEN,
        },
        select: { id: true, status: true, createdAt: true },
      });
    }

    if (targetType === ReportTargetType.POST) {
      const targetPostId = input.targetPostId?.trim();
      if (!targetPostId) throw new BadRequestException('targetPostId requerido.');
      const post = await this.prisma.feedPost.findFirst({
        where: { id: targetPostId, deletedAt: null },
        select: { id: true, authorId: true },
      });
      if (!post) throw new NotFoundException('Publicación no encontrada.');
      if (post.authorId === reporterId) {
        throw new BadRequestException('No puedes reportar tu propia publicación.');
      }

      await this.assertNoOpenDup(reporterId, {
        targetType: ReportTargetType.POST,
        targetPostId,
      });

      return this.prisma.report.create({
        data: {
          reporterId,
          targetType: ReportTargetType.POST,
          targetPostId,
          reason: reasonText,
          status: ReportStatus.OPEN,
        },
        select: { id: true, status: true, createdAt: true },
      });
    }

    if (targetType === ReportTargetType.REVIEW) {
      const targetReviewId = input.targetReviewId?.trim();
      if (!targetReviewId) throw new BadRequestException('targetReviewId requerido.');
      const review = await this.prisma.placeReview.findFirst({
        where: { id: targetReviewId },
        select: { id: true, userId: true },
      });
      if (!review) throw new NotFoundException('Reseña no encontrada.');
      if (review.userId === reporterId) {
        throw new BadRequestException('No puedes reportar tu propia reseña.');
      }

      await this.assertNoOpenDup(reporterId, {
        targetType: ReportTargetType.REVIEW,
        targetReviewId,
      });

      return this.prisma.report.create({
        data: {
          reporterId,
          targetType: ReportTargetType.REVIEW,
          targetReviewId,
          reason: reasonText,
          status: ReportStatus.OPEN,
        },
        select: { id: true, status: true, createdAt: true },
      });
    }

    if (targetType === ReportTargetType.MESSAGE) {
      const targetMessageId = input.targetMessageId?.trim();
      if (!targetMessageId) throw new BadRequestException('targetMessageId requerido.');
      const message = await this.prisma.chatMessage.findFirst({
        where: { id: targetMessageId, deletedAt: null },
        select: { id: true, roomId: true, senderId: true },
      });
      // 404 uniforme: no confirmar existencia a no-participantes.
      if (!message) throw new NotFoundException('Mensaje no encontrado.');

      const membership = await this.prisma.chatParticipant.findUnique({
        where: {
          roomId_userId: { roomId: message.roomId, userId: reporterId },
        },
        select: { userId: true },
      });
      if (!membership) {
        throw new NotFoundException('Mensaje no encontrado.');
      }
      if (message.senderId === reporterId) {
        throw new BadRequestException('No puedes reportar tu propio mensaje.');
      }

      await this.assertNoOpenDup(reporterId, {
        targetType: ReportTargetType.MESSAGE,
        targetMessageId,
      });

      return this.prisma.report.create({
        data: {
          reporterId,
          targetType: ReportTargetType.MESSAGE,
          targetMessageId,
          reason: reasonText,
          status: ReportStatus.OPEN,
        },
        select: { id: true, status: true, createdAt: true },
      });
    }

    throw new BadRequestException('Tipo de reporte no soportado aún.');
  }

  private async assertNoOpenDup(
    reporterId: string,
    where: {
      targetType: ReportTargetType;
      targetUserId?: string;
      targetPostId?: string;
      targetReviewId?: string;
      targetMessageId?: string;
    },
  ) {
    const dup = await this.prisma.report.findFirst({
      where: {
        reporterId,
        ...where,
        status: { in: [ReportStatus.OPEN, ReportStatus.REVIEWING] },
      },
    });
    if (dup) {
      throw new ConflictException('Ya reportaste este contenido.');
    }
  }
}

function normalizeTargetType(raw: string): ReportTargetType | null {
  const v = (raw ?? '').trim().toUpperCase();
  if (v === 'USER') return ReportTargetType.USER;
  if (v === 'POST') return ReportTargetType.POST;
  if (v === 'COMMENT') return ReportTargetType.COMMENT;
  if (v === 'BAR') return ReportTargetType.BAR;
  if (v === 'MESSAGE') return ReportTargetType.MESSAGE;
  if (v === 'REVIEW') return ReportTargetType.REVIEW;
  return null;
}
