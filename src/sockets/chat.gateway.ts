import { ForbiddenException, Logger, OnModuleInit } from '@nestjs/common';
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
import { RealtimeHub } from '../common/realtime/realtime-hub.service';
import { RedisService } from '../common/redis/redis.service';
import { ChatService } from '../modules/chat/chat.service';
import { UsersService } from '../modules/users/users.service';

/** CORS de Socket.IO se configura en ConfigurableIoAdapter (main.ts) desde CORS_ORIGINS. */
@WebSocketGateway({ namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly chat: ChatService,
    private readonly users: UsersService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeHub,
  ) {}

  onModuleInit() {
    this.realtime.setServer(this.server);
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers.authorization?.replace('Bearer ', '') ?? '');
      const payload = await this.jwt.verifyAsync<{ sub?: string; sv?: number }>(token, {
        secret: this.config.getOrThrow<string>('auth.accessSecret'),
        algorithms: ['HS256'],
      });
      if (!payload?.sub || typeof payload.sv !== 'number') {
        client.disconnect();
        return;
      }
      // Misma regla que JwtStrategy: sv debe coincidir con DB.
      const user = await this.users.findAuthSecurity(payload.sub);
      if (!user || user.securityVersion !== payload.sv) {
        client.disconnect();
        return;
      }
      client.data.userId = payload.sub;
      await this.users.setOnline(payload.sub, true);
      await this.redis.client.sadd(`online:${payload.sub}`, client.id);
      client.join(`user:${payload.sub}`);
      const roomIds = await this.chat.listRoomIdsForUser(payload.sub);
      for (const roomId of roomIds) {
        client.join(`room:${roomId}`);
      }
      this.server.emit('presence', { userId: payload.sub, online: true });

      const summary = await this.chat.getSummary(payload.sub);
      client.emit('messenger_summary', summary);
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
    const userId = client.data.userId as string;
    try {
      await this.chat.assertParticipant(body.roomId, userId);
    } catch {
      throw new ForbiddenException('No perteneces a esta sala');
    }
    client.join(`room:${body.roomId}`);
    return { ok: true };
  }

  @SubscribeMessage('typing')
  async typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId: string; typing: boolean },
  ) {
    const userId = client.data.userId as string;
    if (!body?.roomId || !userId) return;
    try {
      await this.chat.assertParticipant(body.roomId, userId);
    } catch {
      throw new ForbiddenException('No perteneces a esta sala');
    }
    client.to(`room:${body.roomId}`).emit('typing', {
      userId,
      roomId: body.roomId,
      typing: !!body.typing,
    });
  }

  @SubscribeMessage('send_message')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId: string; text?: string; imageUrl?: string; replyToId?: string },
  ) {
    const userId = client.data.userId as string;
    const message = await this.chat.sendMessage(
      body.roomId,
      userId,
      body.text,
      body.imageUrl,
      undefined,
      undefined,
      body.replyToId,
    );
    return message;
  }

  @SubscribeMessage('toggle_reaction')
  async toggleReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string; emoji: string },
  ) {
    const userId = client.data.userId as string;
    return this.chat.toggleReaction(body.messageId, userId, body.emoji);
  }

  @SubscribeMessage('read_message')
  async readMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string; roomId: string },
  ) {
    const userId = client.data.userId as string;
    await this.chat.markRead(body.messageId, userId, body.roomId);
    return { ok: true };
  }

  @SubscribeMessage('read_room')
  async readRoom(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string }) {
    const userId = client.data.userId as string;
    return this.chat.markRoomRead(body.roomId, userId);
  }
}
