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
  CreateBarParaDateMagazineDto,
  UpdateBarParaDateMagazineDto,
} from './dto/bar-para-date-magazine.dto';
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

  @Get('para-date')
  @ApiOperation({ summary: 'Listar piezas ParaDate del local (Legend)' })
  listParaDate(@CurrentUser() user: JwtPayload) {
    return this.magazine.listParaDateForBarOwner(user.sub);
  }

  @Post('para-date')
  @ApiOperation({ summary: 'Publicar experiencia ParaDate (Legend)' })
  createParaDate(@CurrentUser() user: JwtPayload, @Body() body: CreateBarParaDateMagazineDto) {
    return this.magazine.createParaDateForBar(user.sub, body);
  }

  @Patch('para-date/:id')
  @ApiOperation({ summary: 'Actualizar pieza ParaDate del local' })
  updateParaDate(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateBarParaDateMagazineDto,
  ) {
    return this.magazine.updateParaDateForBar(user.sub, id, body);
  }

  @Delete('para-date/:id')
  @ApiOperation({ summary: 'Retirar pieza ParaDate del local' })
  removeParaDate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.magazine.removeParaDateForBar(user.sub, id);
  }
}
