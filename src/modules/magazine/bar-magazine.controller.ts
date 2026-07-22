import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  CreateBarStrongMagazineDto,
  UpdateBarStrongMagazineDto,
} from './dto/bar-strong-magazine.dto';
import { MagazineService } from './magazine.service';

@ApiTags('bar-magazine')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.BAR)
@Controller('bars/me/magazine')
export class BarMagazineController {
  constructor(private readonly magazine: MagazineService) {}

  @Get('strong')
  @ApiOperation({ summary: 'Listar promos del local en sección Fuerte (Legend)' })
  listStrong(@CurrentUser() user: JwtPayload) {
    return this.magazine.listStrongForBarOwner(user.sub);
  }

  @Post('strong')
  @ApiOperation({ summary: 'Publicar promo de shot/bebida fuerte en Fuerte (Legend)' })
  createStrong(@CurrentUser() user: JwtPayload, @Body() body: CreateBarStrongMagazineDto) {
    return this.magazine.createStrongForBar(user.sub, body);
  }

  @Patch('strong/:id')
  @ApiOperation({ summary: 'Actualizar promo Fuerte del local' })
  updateStrong(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateBarStrongMagazineDto,
  ) {
    return this.magazine.updateStrongForBar(user.sub, id, body);
  }

  @Delete('strong/:id')
  @ApiOperation({ summary: 'Retirar promo Fuerte del local' })
  removeStrong(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.magazine.removeStrongForBar(user.sub, id);
  }
}
