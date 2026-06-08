import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatModule } from '../modules/chat/chat.module';
import { FriendsModule } from '../modules/friends/friends.module';
import { UsersModule } from '../modules/users/users.module';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [JwtModule, ChatModule, FriendsModule, UsersModule],
  providers: [ChatGateway],
})
export class SocketsModule {}
