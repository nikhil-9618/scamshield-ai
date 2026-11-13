import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';
import { ScanProcessorService } from './scan-processor.service';
import { ScanQueueService } from './scan-queue.service';
import { UrlAnalyzerService } from './url-analyzer.service';
import { AiEngineClient } from './ai-engine.client';
import { IntelService } from './intel/intel.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ScansController],
  providers: [
    ScansService,
    ScanProcessorService,
    ScanQueueService,
    UrlAnalyzerService,
    AiEngineClient,
    IntelService,
  ],
  exports: [ScansService, ScanQueueService, UrlAnalyzerService, AiEngineClient, IntelService],
})
export class ScansModule {}
