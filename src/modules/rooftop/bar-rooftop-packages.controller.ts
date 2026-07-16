import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateRooftopPackageDto, UpdateRooftopPackageDto } from './dto/rooftop-package.dto';
import { RooftopPackagesService } from './rooftop-packages.service';

@ApiTags('bar-rooftop')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.BAR)
@Controller('bars/rooftop/packages')
export class BarRooftopPackagesController {
  constructor(private readonly packages: RooftopPackagesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar paquetes Rooftop del local (Legend, terraza verificada)' })
  list(@CurrentUser() user: JwtPayload) {
    return this.packages.listForOwner(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Crear paquete Rooftop (pendiente de revisión)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRooftopPackageDto) {
    return this.packages.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar paquete Rooftop (vuelve a revisión si ya estaba moderado)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRooftopPackageDto,
  ) {
    return this.packages.update(user.sub, id, dto);
  }

  @Patch(':id/resubmit')
  @ApiOperation({ summary: 'Reenviar paquete a revisión' })
  resubmit(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.packages.resubmit(user.sub, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar (soft delete) paquete Rooftop' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.packages.softDelete(user.sub, id);
  }
}
