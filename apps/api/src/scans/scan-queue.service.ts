import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { loadEnv } from '../common/config/env';
import { ScanProcessorService } from './scan-processor.service';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scans run through BullMQ when Redis is available, otherwise inline. Either
 * way the controller waits for a terminal status so the UI receives a result.
 * Long-running scans can be moved to a dedicated worker without API changes.
 */
@Injectable()
export class ScanQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ScanQueueService.name);
  private readonly env = loadEnv();
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: Redis | null = null;
  private initialised = false;
  private degraded = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly processor: ScanProcessorService,
  ) {}

  private async ensureQueue(): Promise<void> {
    if (this.initialised) return;
    this.initialised = true;
    if (!this.env.REDIS_URL || !this.redis.isConfigured) return;
    try {
      this.connection = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
      this.connection.on('error', (error) => this.logger.warn(`Queue Redis error: ${error.message}`));
      this.queue = new Queue('scans', { connection: this.connection });
      this.worker = new Worker(
        'scans',
        async (job: Job<{ scanId: string }>) => {
          await this.processor.process(job.data.scanId);
        },
        { connection: this.connection, concurrency: this.env.QUEUE_CONCURRENCY },
      );
      this.worker.on('failed', (job, error) => {
        this.logger.error(`Scan job ${job?.id ?? 'unknown'} failed: ${error.message}`);
      });
      this.logger.log(`BullMQ scan worker online (concurrency ${this.env.QUEUE_CONCURRENCY})`);
    } catch (error) {
      this.degraded = true;
      this.logger.warn(`Queue unavailable, falling back to inline scans: ${error instanceof Error ? error.message : 'unknown'}`);
      this.queue = null;
    }
  }

  async run(scanId: string): Promise<void> {
    await this.ensureQueue();
    if (this.queue) {
      try {
        await this.queue.add(
          'scan',
          { scanId },
          { jobId: `scan-${scanId}`, attempts: 1, removeOnComplete: 200, removeOnFail: 200 },
        );
        await this.waitForCompletion(scanId);
        return;
      } catch (error) {
        this.degraded = true;
        this.logger.warn(`Could not enqueue scan ${scanId}, running inline: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
    await this.processor.process(scanId);
  }

  private async waitForCompletion(scanId: string): Promise<void> {
    const deadline = Date.now() + this.env.SCAN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const scan = await this.prisma.scan.findUnique({ where: { id: scanId }, select: { status: true } });
      if (!scan || scan.status === 'completed' || scan.status === 'failed') return;
      await sleep(400);
    }
    this.logger.warn(`Timed out waiting for scan ${scanId} to finish; the worker may still complete it.`);
  }

  async stats(): Promise<{ driver: 'bullmq' | 'inline'; pending: number; failed: number }> {
    if (!this.queue) return { driver: 'inline', pending: 0, failed: 0 };
    try {
      const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
      return {
        driver: 'bullmq',
        pending: (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0),
        failed: counts.failed ?? 0,
      };
    } catch {
      return { driver: 'inline', pending: 0, failed: 0 };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    await this.connection?.quit().catch(() => undefined);
  }
}
