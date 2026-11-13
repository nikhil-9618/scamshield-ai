import { Injectable } from '@nestjs/common';
import type { ProviderHealthDto, SystemHealth } from '@scamshield/shared-types';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { AiEngineClient } from '../scans/ai-engine.client';
import { IntelService } from '../scans/intel/intel.service';
import { ScanQueueService } from '../scans/scan-queue.service';

const VERSION = '1.0.0';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiEngineClient,
    private readonly intel: IntelService,
    private readonly queue: ScanQueueService,
  ) {}

  async summary() {
    const db = await this.prisma.ping();
    return {
      status: db.ok ? ('ok' as const) : ('down' as const),
      database: db.ok ? 'ok' : 'error',
      version: VERSION,
      checkedAt: new Date().toISOString(),
    };
  }

  async detailed(): Promise<SystemHealth> {
    const [db, redisPing, ai, queue, providers] = await Promise.all([
      this.prisma.ping(),
      this.redis.ping(),
      this.ai.health(),
      this.queue.stats(),
      this.intel.health(),
    ]);

    const providerDtos: ProviderHealthDto[] = [
      ...providers.map((provider) => ({
        name: provider.name,
        status: provider.status === 'healthy' ? ('healthy' as const) : ('disabled' as const),
        configured: provider.configured,
        latencyMs: null,
        message: provider.message,
        checkedAt: new Date().toISOString(),
      })),
      {
        name: 'AI engine',
        status: ai.reachable ? ('healthy' as const) : ('degraded' as const),
        configured: true,
        latencyMs: ai.latencyMs,
        message: ai.detail,
        checkedAt: new Date().toISOString(),
      },
    ];

    const status: SystemHealth['status'] = !db.ok ? 'down' : ai.reachable ? 'ok' : 'degraded';

    return {
      status,
      uptimeSeconds: Math.round(process.uptime()),
      database: { status: db.ok ? 'ok' : 'error', latencyMs: db.latencyMs, message: db.message },
      redis: {
        status: redisPing.ok ? 'ok' : this.redis.isConfigured ? 'error' : 'disabled',
        latencyMs: redisPing.latencyMs,
        message: redisPing.message,
      },
      queue,
      aiEngine: {
        status: ai.reachable ? 'ok' : 'unavailable',
        latencyMs: ai.latencyMs,
        message: ai.detail,
      },
      providers: providerDtos,
      version: VERSION,
      checkedAt: new Date().toISOString(),
    };
  }
}
