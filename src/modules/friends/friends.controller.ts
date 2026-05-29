import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { FriendsService } from './friends.service';

@ApiTags('friends')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

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

  @Post('block')
  block(@CurrentUser() user: JwtPayload, @Body() body: { targetId: string }) {
    return this.friends.block(user.sub, body.targetId);
  }
}
