import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AdminModerationActionDto } from '../promotions/dto/admin-moderation-action.dto';
import { AdminRejectPromotionDto } from '../promotions/dto/admin-reject-promotion.dto';
import { AdminPromotionModerationService } from '../promotions/admin-promotion-moderation.service';

@ApiTags('admin-promotions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('admin/promotions')
export class AdminPromotionsController {
  constructor(private readonly moderation: AdminPromotionModerationService) {}

  @Get('pending')
  pending(@Query('limit') limit?: string) {
    return this.moderation.listPending(parseInt(limit ?? '100', 10));
  }

  @Patch(':id/approve')
  approve(@CurrentUser() admin: JwtPayload, @Param('id') id: string) {
    return this.moderation.approve(id, admin.sub);
  }

  @Patch(':id/reject')
  reject(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() body: AdminRejectPromotionDto,
  ) {
    return this.moderation.reject(id, admin.sub, body.reason);
  }

  @Patch(':id/flag')
  flag(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() body: AdminModerationActionDto,
  ) {
    return this.moderation.flag(id, admin.sub, body.reason?.trim() || 'Marcada para revisión');
  }
}

