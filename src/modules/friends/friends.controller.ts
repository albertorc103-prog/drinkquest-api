import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UsersService } from '../users/users.service';
import { FriendsService } from './friends.service';

@ApiTags('friends')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(
    private readonly friends: FriendsService,
    private readonly users: UsersService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.friends.listFriends(user.sub);
  }

  @Get('requests')
  requests(@CurrentUser() user: JwtPayload) {
    return this.friends.pendingRequests(user.sub);
  }

  @Get('requests/sent')
  sentRequests(@CurrentUser() user: JwtPayload) {
    return this.friends.sentRequests(user.sub);
  }

  @Get('profile/:userId')
  socialProfile(@CurrentUser() user: JwtPayload, @Param('userId') userId: string) {
    return this.users.getSocialProfile(userId, user.sub);
  }

  @Post('requests')
  send(@CurrentUser() user: JwtPayload, @Body() body: { receiverId: string; message?: string }) {
    return this.friends.sendRequest(user.sub, body.receiverId, body.message);
  }

  @Post('requests/:id/accept')
  accept(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.friends.respond(user.sub, id, true);
  }

  @Post('requests/:id/reject')
  reject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.friends.respond(user.sub, id, false);
  }

  @Post('requests/:id/cancel')
  cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.friends.cancelRequest(user.sub, id);
  }

  @Delete(':friendId')
  remove(@CurrentUser() user: JwtPayload, @Param('friendId') friendId: string) {
    return this.friends.removeFriend(user.sub, friendId);
  }

  @Post('block')
  block(@CurrentUser() user: JwtPayload, @Body() body: { targetId: string }) {
    return this.friends.block(user.sub, body.targetId);
  }
}
