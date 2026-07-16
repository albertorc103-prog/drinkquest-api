import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateSpecialDrinkDto, UpdateSpecialDrinkDto } from './dto/special-drink.dto';
import { SpecialDrinksService } from './special-drinks.service';

@ApiTags('bar-special-drinks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.BAR)
@Controller('bars/special-drinks')
export class BarSpecialDrinksController {
  constructor(private readonly specialDrinks: SpecialDrinksService) {}

  @Get()
  @ApiOperation({ summary: 'Listar bebidas especializadas del local (máx. 3)' })
  list(@CurrentUser() user: JwtPayload) {
    return this.specialDrinks.listForOwner(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Crear bebida especializada (COMMON, edición limitada, pendiente de revisión)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSpecialDrinkDto) {
    return this.specialDrinks.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar bebida especializada (vuelve a revisión si ya estaba moderada)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSpecialDrinkDto,
  ) {
    return this.specialDrinks.update(user.sub, id, dto);
  }

  @Patch(':id/resubmit')
  @ApiOperation({ summary: 'Reenviar a revisión tras rechazo o flag' })
  resubmit(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.specialDrinks.resubmit(user.sub, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar (soft delete) bebida especializada' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.specialDrinks.softDelete(user.sub, id);
  }
}
