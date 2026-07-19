import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MagazineSection } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuthPermission } from '../auth/permissions/auth-permission.enum';
import { CreateMagazineEditorialInput, MagazineService } from './magazine.service';

@ApiTags('magazine')
@Controller()
export class MagazineController {
  constructor(private readonly magazine: MagazineService) {}

  @Get('magazine/feed')
  @ApiOperation({ summary: 'Feed editorial Strong / Para Date' })
  feed(@Query('section') section?: string, @Query('page') page?: string) {
    const resolved = this.parseSection(section);
    return this.magazine.feed(resolved, parseInt(page ?? '1', 10));
  }

  @Get('admin/magazine')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  listAdmin(@Query('section') section?: string) {
    const resolved = section ? this.parseSection(section) : undefined;
    return this.magazine.listAdmin(resolved);
  }

  @Post('admin/magazine')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  create(@Body() body: CreateMagazineEditorialInput) {
    return this.magazine.create({
      ...body,
      section: this.parseSection(String(body.section)),
    });
  }

  @Patch('admin/magazine/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  update(@Param('id') id: string, @Body() body: Partial<CreateMagazineEditorialInput>) {
    return this.magazine.update(id, {
      ...body,
      ...(body.section ? { section: this.parseSection(String(body.section)) } : {}),
    });
  }

  @Delete('admin/magazine/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  remove(@Param('id') id: string) {
    return this.magazine.remove(id);
  }

  private parseSection(raw?: string): MagazineSection {
    const v = String(raw ?? '').trim().toUpperCase().replace('-', '_');
    if (v === 'STRONG' || v === 'FUERTE') return MagazineSection.STRONG;
    if (v === 'PARA_DATE' || v === 'DATE' || v === 'PARADATE') return MagazineSection.PARA_DATE;
    return MagazineSection.STRONG;
  }
}
