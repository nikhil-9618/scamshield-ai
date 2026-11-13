import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { ReportsModule } from '../reports/reports.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [HealthModule, ReportsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
