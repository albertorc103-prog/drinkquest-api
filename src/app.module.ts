import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { BarMissionsModule } from './modules/bar-missions/bar-missions.module';
import { BarsModule } from './modules/bars/bars.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ChatModule } from './modules/chat/chat.module';
import { DrinksModule } from './modules/drinks/drinks.module';
import { FeedModule } from './modules/feed/feed.module';
import { FriendsModule } from './modules/friends/friends.module';
import { MissionsModule } from './modules/missions/missions.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { QrModule } from './modules/qr/qr.module';
import { SpecialDrinksModule } from './modules/special-drinks/special-drinks.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './common/health/health.module';
import { RedisModule } from './common/redis/redis.module';
import { RealtimeModule } from './common/realtime/realtime.module';
import { LoggerModule } from './common/logger/logger.module';
import { SocketsModule } from './sockets/sockets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    AppConfigModule,
    LoggerModule,
    DatabaseModule,
    RedisModule,
    RealtimeModule,
    ThrottlerModule.forRootAsync({
      inject: [],
      useFactory: () => [
        {
          ttl: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
          limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
        },
      ],
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    FriendsModule,
    ChatModule,
    DrinksModule,
    QrModule,
    MissionsModule,
    FeedModule,
    BarsModule,
    PaymentsModule,
    AdminModule,
    PromotionsModule,
    NotificationsModule,
    UploadsModule,
    SpecialDrinksModule,
    BarMissionsModule,
    SocketsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
  ],
})
export class AppModule {}
