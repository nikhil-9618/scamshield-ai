import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: 'success' | 'failure' | 'denied';
  request?: Request;
  metadata?: Record<string, unknown>;
}

export function requestMeta(request?: Request): { ipAddress: string | null; userAgent: string | null } {
  if (!request) return { ipAddress: null, userAgent: null };
  const forwarded = request.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();
  const ipAddress = (request.ip ?? forwardedIp ?? request.socket?.remoteAddress ?? null)?.slice(0, 64) ?? null;
  const userAgent = request.headers['user-agent']?.slice(0, 255) ?? null;
  return { ipAddress, userAgent };
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Audit failures must never break the primary action, but they are logged loudly. */
  async record(entry: AuditEntry): Promise<void> {
    const meta = requestMeta(entry.request);
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          actorRole: entry.actorRole ?? null,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId ?? null,
          outcome: entry.outcome,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to write audit log for ${entry.action}: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
