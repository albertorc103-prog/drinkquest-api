import { Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from '../modules/chat/chat.service';
import { FriendsService } from '../modules/friends/friends.service';
import { RedisService } from '../common/redis/redis.service';
import { UsersService } from '../modules/users/users.service';

/** CORS de Socket.IO se configura en ConfigurableIoAdapter (main.ts) desde CORS_ORIGINS. */
@WebSocketGateway({ namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly chat: ChatService,
    private readonly friends: FriendsService,
    private readonly users: UsersService,
    private readonly redis: RedisService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers.authorization?.replace('Bearer ', '') ?? '');
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('auth.accessSecret'),
      });
      client.data.userId = payload.sub;
      await this.users.setOnline(payload.sub, true);
      await this.redis.client.sadd(`online:${payload.sub}`, client.id);
      client.join(`user:${payload.sub}`);
      this.server.emit('presence', { userId: payload.sub, online: true });
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    await this.redis.client.srem(`online:${userId}`, client.id);
    const still = await this.redis.client.scard(`online:${userId}`);
    if (still === 0) {
      await this.users.setOnline(userId, false);
      this.server.emit('presence', { userId, online: false });
    }
  }

  @SubscribeMessage('join_room')
  async joinRoom(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string }) {
    client.join(`room:${body.roomId}`);
    return { ok: true };
  }

  @SubscribeMessage('typing')
  async typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId: string; typing: boolean },
  ) {
    client.to(`room:${body.roomId}`).emit('typing', {
      userId: client.data.userId,
      roomId: body.roomId,
      typing: body.typing,
    });
  }

  @SubscribeMessage('send_message')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId: string; text?: string; imageUrl?: string },
  ) {
    const userId = client.data.userId as string;
    const message = await this.chat.sendMessage(body.roomId, userId, body.text, body.imageUrl);
    this.server.to(`room:${body.roomId}`).emit('message', message);
    return message;
  }

  @SubscribeMessage('read_message')
  async readMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string; roomId: string },
  ) {
    const userId = client.data.userId as string;
    await this.chat.markRead(body.messageId, userId);
    client.to(`room:${body.roomId}`).emit('read', { messageId: body.messageId, userId });
  }
}
