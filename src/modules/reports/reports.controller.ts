import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ReportsService } from './reports.service';

class CreateReportDto {
  @IsString()
  @IsIn(['USER', 'POST', 'COMMENT', 'BAR', 'MESSAGE', 'REVIEW'])
  targetType!: string;

  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @IsOptional()
  @IsUUID()
  targetPostId?: string;

  @IsOptional()
  @IsUUID()
  targetReviewId?: string;

  @IsOptional()
  @IsUUID()
  targetMessageId?: string;

  @IsString()
  @IsIn(['SPAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'IMPERSONATION', 'OTHER'])
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;
}

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Crear reporte de contenido/usuario (no elimina automáticamente)',
  })
  create(@CurrentUser() user: JwtPayload, @Body() body: CreateReportDto) {
    return this.reports.create(user.sub, body);
  }
}
