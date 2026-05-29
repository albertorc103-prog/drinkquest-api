import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

/** Puente para emitir eventos Socket.IO desde servicios REST sin acoplar al gateway. */
@Injectable()
export class RealtimeHub {
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToRoom(roomId: string, event: string, payload: unknown) {
    this.server?.to(`room:${roomId}`).emit(event, payload);
  }

  emitGlobal(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }
}
