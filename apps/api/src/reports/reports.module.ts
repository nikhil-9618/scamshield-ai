import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsController, ThreatsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ReportsController, ThreatsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
