import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  RegisterDeviceTokenDto,
  UnregisterDeviceTokenDto,
} from './dto/device-token.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query('page') page?: string) {
    return this.notifications.list(user.sub, parseInt(page ?? '1', 10));
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.notifications.unreadCount(user.sub);
  }

  @Get('unread-by-category')
  unreadByCategory(@CurrentUser() user: JwtPayload) {
    return this.notifications.unreadByCategory(user.sub);
  }

  @Post('devices/fcm')
  registerDevice(
    @CurrentUser() user: JwtPayload,
    @Body() body: RegisterDeviceTokenDto,
  ) {
    return this.notifications.registerDeviceToken(
      user.sub,
      body.token,
      body.platform,
    );
  }

  @Delete('devices/fcm')
  unregisterDevice(
    @CurrentUser() user: JwtPayload,
    @Body() body: UnregisterDeviceTokenDto,
  ) {
    return this.notifications.unregisterDeviceToken(user.sub, body.token);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notifications.markRead(user.sub, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead(user.sub);
  }

  @Post('read-category')
  markCategoryRead(
    @CurrentUser() user: JwtPayload,
    @Body() body: { category?: string },
  ) {
    const raw = String(body?.category ?? '').toLowerCase();
    const category = raw === 'promotions' || raw === 'promos' ? 'promotions' : 'cocktails';
    return this.notifications.markCategoryRead(user.sub, category);
  }
}
