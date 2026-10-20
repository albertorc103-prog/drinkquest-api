import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BarMissionMedalVersionStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiAuthForbiddenResponses } from '../../common/decorators/api-auth-forbidden.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuthPermission } from '../auth/permissions/auth-permission.enum';
import { AdminBarMissionMedalService } from './admin-bar-mission-medal.service';
import {
  AdminBarMedalArtworkDto,
  AdminBarMedalReviewDto,
  AdminBarMedalRewardDto,
} from './dto/bar-mission-medal.dto';
import { AdminMedalDesignProposalAssignDto } from './dto/bar-medal-design-proposal.dto';

@ApiTags('admin-bar-mission-medals')
@ApiBearerAuth()
@ApiAuthForbiddenResponses()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/bar-mission-medals')
export class AdminBarMissionMedalController {
  constructor(private readonly moderation: AdminBarMissionMedalService) {}

  @Get()
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({
    summary: 'Listar versiones de medalla (default PENDING_REVIEW; status=ALL sin filtro)',
  })
  list(
    @Query('status') status?: string,
    @Query('barId') barId?: string,
    @Query('seasonId') seasonId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const normalized =
      !status || status.trim() === ''
        ? undefined
        : status.trim().toUpperCase() === 'ALL'
          ? ('ALL' as const)
          : (status.trim().toUpperCase() as BarMissionMedalVersionStatus);
    return this.moderation.list({
      status: normalized,
      barId,
      seasonId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Post(':versionId/design-proposals/batches')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Iniciar conjunto de 5 propuestas gráficas (DRAFT)' })
  createDesignProposalBatch(
    @CurrentUser() admin: JwtPayload,
    @Param('versionId') versionId: string,
  ) {
    return this.moderation.createDesignProposalBatch(versionId, admin.sub);
  }

  @Get(':versionId/design-proposals')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Conjunto abierto y propuestas de la versión' })
  getDesignProposals(@Param('versionId') versionId: string) {
    return this.moderation.getDesignProposalBatch(versionId);
  }

  @Put(':versionId/design-proposals/batches/:batchId/positions/:position')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Asignar o reemplazar imagen en posición 1–5 (solo DRAFT)' })
  assignDesignProposal(
    @CurrentUser() admin: JwtPayload,
    @Param('versionId') versionId: string,
    @Param('batchId') batchId: string,
    @Param('position', ParseIntPipe) position: number,
    @Body() body: AdminMedalDesignProposalAssignDto,
  ) {
    return this.moderation.assignDesignProposal(
      versionId,
      batchId,
      position,
      admin.sub,
      body.artworkAssetId,
    );
  }

  @Post(':versionId/design-proposals/batches/:batchId/send')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Enviar las 5 propuestas al establecimiento Legend' })
  sendDesignProposals(
    @CurrentUser() admin: JwtPayload,
    @Param('versionId') versionId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.moderation.sendDesignProposalBatch(versionId, batchId, admin.sub);
  }

  @Get(':versionId')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Detalle de versión de medalla para revisión' })
  detail(@Param('versionId') versionId: string) {
    return this.moderation.getDetail(versionId);
  }

  @Post(':versionId/approve')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Aprobar versión (PENDING_REVIEW → APPROVED)' })
  approve(@CurrentUser() admin: JwtPayload, @Param('versionId') versionId: string) {
    return this.moderation.approve(versionId, admin.sub);
  }

  @Post(':versionId/request-changes')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Solicitar cambios (requiere comentario)' })
  requestChanges(
    @CurrentUser() admin: JwtPayload,
    @Param('versionId') versionId: string,
    @Body() body: AdminBarMedalReviewDto,
  ) {
    return this.moderation.requestChanges(versionId, admin.sub, body.reason);
  }

  @Post(':versionId/reject')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Rechazar versión (terminal; requiere comentario)' })
  reject(
    @CurrentUser() admin: JwtPayload,
    @Param('versionId') versionId: string,
    @Body() body: AdminBarMedalReviewDto,
  ) {
    return this.moderation.reject(versionId, admin.sub, body.reason);
  }

  @Post(':versionId/activate')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Activar versión APPROVED (desactiva ACTIVE previa)' })
  activate(@CurrentUser() admin: JwtPayload, @Param('versionId') versionId: string) {
    return this.moderation.activate(versionId, admin.sub);
  }

  @Post(':versionId/disable')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Desactivar versión ACTIVE' })
  disable(@CurrentUser() admin: JwtPayload, @Param('versionId') versionId: string) {
    return this.moderation.disable(versionId, admin.sub);
  }

  @Patch(':versionId/reward')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Definir xpReward (0–500; no ACTIVE)' })
  reward(@Param('versionId') versionId: string, @Body() body: AdminBarMedalRewardDto) {
    return this.moderation.setReward(versionId, body.xpReward);
  }

  @Patch(':versionId/artwork')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({
    summary: 'Asignar artwork administrativo a la versión (snapshot; no ACTIVE)',
  })
  setArtwork(
    @CurrentUser() admin: JwtPayload,
    @Param('versionId') versionId: string,
    @Body() body: AdminBarMedalArtworkDto,
  ) {
    return this.moderation.setArtwork(versionId, admin.sub, body);
  }
}
