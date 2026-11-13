import { Module } from '@nestjs/common';
import { ScansModule } from '../scans/scans.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [ScansModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
