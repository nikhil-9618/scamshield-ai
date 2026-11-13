import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { loadEnv } from '../config/env';

/**
 * Optional Redis. The platform is designed to run without it (inline queue,
 * in-memory throttling), so connection failures are reported, never fatal.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly env = loadEnv();
  private client: Redis | null = null;
  private available = false;

  constructor() {
    if (!this.env.REDIS_URL) {
      this.logger.warn('REDIS_URL not set - using inline scan execution and in-memory rate limiting');
      return;
    }
    this.client = new Redis(this.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => (attempt > 5 ? null : Math.min(attempt * 500, 3000)),
    });
    this.client.on('error', (error) => {
      this.available = false;
      this.logger.warn(`Redis error: ${error.message}`);
    });
    this.client.on('ready', () => {
      this.available = true;
      this.logger.log('Redis connection ready');
    });
    this.client.connect().catch((error: Error) => {
      this.logger.warn(`Redis unavailable, continuing in degraded mode: ${error.message}`);
    });
  }

  get isConfigured(): boolean {
    return Boolean(this.client);
  }

  getClient(): Redis | null {
    return this.available ? this.client : null;
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number | null; message: string }> {
    if (!this.client) return { ok: false, latencyMs: null, message: 'Redis not configured (inline mode)' };
    const started = Date.now();
    try {
      const result = await this.client.ping();
      return { ok: result === 'PONG', latencyMs: Date.now() - started, message: result === 'PONG' ? 'Redis reachable' : 'Unexpected reply' };
    } catch (error) {
      return { ok: false, latencyMs: null, message: error instanceof Error ? error.message : 'Redis unreachable' };
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
