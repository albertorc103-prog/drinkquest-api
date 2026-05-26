import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ChatService } from './chat.service';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('rooms')
  rooms(@CurrentUser() user: JwtPayload) {
    return this.chat.myRooms(user.sub);
  }

  @Post('rooms')
  open(@CurrentUser() user: JwtPayload, @Body() body: { friendId: string }) {
    return this.chat.getOrCreateRoom(user.sub, body.friendId);
  }

  @Get('rooms/:roomId/messages')
  messages(
    @CurrentUser() user: JwtPayload,
    @Param('roomId') roomId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.chat.messages(roomId, user.sub, cursor);
  }

  @Post('rooms/:roomId/messages')
  send(
    @CurrentUser() user: JwtPayload,
    @Param('roomId') roomId: string,
    @Body() body: { body?: string; imageUrl?: string },
  ) {
    return this.chat.sendMessage(roomId, user.sub, body.body, body.imageUrl);
  }

  @Post('messages/:messageId/read')
  read(@CurrentUser() user: JwtPayload, @Param('messageId') messageId: string) {
    return this.chat.markRead(messageId, user.sub);
  }
}
