import { Module } from '@nestjs/common';
import { FcmService } from './fcm.service';
import { MailService } from './mail.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, MailService, FcmService],
  exports: [NotificationsService, MailService, FcmService],
})
export class NotificationsModule {}
