import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type {
  AdminAnalytics,
  AdminCommunityReportDto,
  DistributionSlice,
  Paginated,
  RiskLevel,
  ScanType,
  ThreatDomainDto,
  TrendPoint,
} from '@scamshield/shared-types';
import { RISK_LEVEL_LABELS } from '@scamshield/shared-types';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ApiException } from '../common/http/api-exception';
import { rateLimitMetrics } from '../common/security/rate-limit.metrics';
import { registrableDomain } from '../scans/detectors/brands';
import { HealthService } from '../health/health.service';
import { ReportsService } from '../reports/reports.service';
import type { AdminReportUpdateInput } from '@scamshield/validation';

const RISK_ORDER: RiskLevel[] = ['low', 'moderate', 'high', 'critical'];
const SCAN_TYPES: ScanType[] = ['message', 'url', 'screenshot', 'qr', 'email'];

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly healthService: HealthService,
    private readonly reports: ReportsService,
  ) {}

  async analytics(): Promise<AdminAnalytics> {
    const now = Date.now();
    const since7 = new Date(now - 7 * 86_400_000);
    const since14 = new Date(now - 14 * 86_400_000);
    const since24h = new Date(now - 86_400_000);

    const [
      users,
      verified,
      newUsers,
      admins,
      scans,
      completed,
      failed,
      scans7,
      byType,
      riskGroups,
      trendScans,
      pendingReports,
      verifiedReports,
      rejectedReports,
      duplicateReports,
      feedbackTotal,
      feedbackIncorrect,
      threatTotal,
      threatVerified,
      threatActive,
      failedLogins,
      lockedAccounts,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, emailVerifiedAt: { not: null } } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: since7 } } }),
      this.prisma.user.count({ where: { deletedAt: null, roles: { some: { role: { name: 'admin' } } } } }),
      this.prisma.scan.count({ where: { deletedAt: null } }),
      this.prisma.scan.count({ where: { deletedAt: null, status: 'completed' } }),
      this.prisma.scan.count({ where: { deletedAt: null, status: 'failed' } }),
      this.prisma.scan.count({ where: { deletedAt: null, createdAt: { gte: since7 } } }),
      this.prisma.scan.groupBy({ by: ['type'], where: { deletedAt: null }, _count: true, orderBy: { type: 'asc' } }),
      this.prisma.scan.groupBy({
        by: ['riskLevel'],
        where: { deletedAt: null, status: 'completed' },
        _count: true,
        orderBy: { riskLevel: 'asc' },
      }),
      this.prisma.scan.findMany({
        where: { deletedAt: null, createdAt: { gte: since14 } },
        select: { createdAt: true, riskScore: true },
      }),
      this.prisma.communityReport.count({ where: { status: 'pending' } }),
      this.prisma.communityReport.count({ where: { status: 'verified' } }),
      this.prisma.communityReport.count({ where: { status: 'rejected' } }),
      this.prisma.communityReport.count({ where: { status: 'duplicate' } }),
      this.prisma.scanFeedback.count(),
      this.prisma.scanFeedback.count({ where: { verdict: 'incorrect' } }),
      this.prisma.threatDomain.count(),
      this.prisma.threatDomain.count({ where: { verified: true } }),
      this.prisma.threatDomain.count({ where: { active: true } }),
      this.prisma.auditLog.count({ where: { action: 'auth.login', outcome: 'failure', createdAt: { gte: since24h } } }),
      this.prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
    ]);

    const buckets = new Map<string, TrendPoint>();
    for (let index = 13; index >= 0; index -= 1) {
      const date = dayKey(new Date(now - index * 86_400_000));
      buckets.set(date, { date, scans: 0, highRisk: 0 });
    }
    for (const scan of trendScans) {
      const bucket = buckets.get(dayKey(scan.createdAt));
      if (!bucket) continue;
      bucket.scans += 1;
      if ((scan.riskScore ?? 0) >= 50) bucket.highRisk += 1;
    }

    const health = await this.healthService.detailed();
    const metrics = rateLimitMetrics.snapshot();

    const typedByType = byType as unknown as Array<{ type: ScanType; _count: { _all: number } }>;
    const typedRiskGroups = riskGroups as unknown as Array<{ riskLevel: RiskLevel; _count: { _all: number } }>;

    const byTypeDistribution: DistributionSlice<ScanType>[] = SCAN_TYPES.map((type) => ({
      key: type,
      label: type === 'url' ? 'URL' : type.charAt(0).toUpperCase() + type.slice(1),
      count: typedByType.find((entry) => entry.type === type)?._count._all ?? 0,
    }));

    const riskDistribution: DistributionSlice<RiskLevel>[] = RISK_ORDER.map((level) => ({
      key: level,
      label: RISK_LEVEL_LABELS[level],
      count: typedRiskGroups.find((entry) => entry.riskLevel === level)?._count._all ?? 0,
    }));

    return {
      users: { total: users, verified, newLast7Days: newUsers, admins },
      scans: {
        total: scans,
        completed,
        failed,
        last7Days: scans7,
        byType: byTypeDistribution,
        riskDistribution,
        trend: [...buckets.values()],
      },
      reports: {
        pending: pendingReports,
        verified: verifiedReports,
        rejected: rejectedReports,
        duplicate: duplicateReports,
      },
      feedback: { total: feedbackTotal, incorrect: feedbackIncorrect },
      threatDomains: { total: threatTotal, verified: threatVerified, active: threatActive },
      abuse: {
        rateLimitedRequests: metrics.rejected,
        failedLogins24h: failedLogins,
        lockedAccounts,
      },
      providers: health.providers,
    };
  }

  async users(query: string, page: number, pageSize: number) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query
        ? { OR: [{ email: { contains: query.toLowerCase() } }, { displayName: { contains: query, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          roles: { include: { role: true } },
          _count: { select: { scans: true, reports: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles.map((entry) => entry.role.name),
        emailVerified: Boolean(user.emailVerifiedAt),
        mfaEnabled: user.mfaEnabled,
        suspended: Boolean(user.suspendedAt),
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        scanCount: user._count.scans,
        reportCount: user._count.reports,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async updateUser(
    actorId: string,
    userId: string,
    input: { roles?: string[]; suspended?: boolean },
    request: Request,
  ) {
    if (actorId === userId && input.suspended) {
      throw ApiException.badRequest('You cannot suspend your own account.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
    if (!user) throw ApiException.notFound('User not found');

    if (input.roles) {
      const adminCount = await this.prisma.userRole.count({
        where: { role: { name: 'admin' }, user: { deletedAt: null } },
      });
      const currentlyAdmin = user.roles.some((entry) => entry.role.name === 'admin');
      if (actorId === userId && !input.roles.includes('admin')) {
        throw ApiException.badRequest('You cannot remove your own admin role.');
      }
      if (currentlyAdmin && !input.roles.includes('admin') && adminCount <= 1) {
        throw ApiException.badRequest('At least one admin account must remain.');
      }
      const roles = await this.prisma.role.findMany({ where: { name: { in: input.roles } } });
      if (roles.length !== input.roles.length) {
        throw ApiException.badRequest('One or more roles are invalid.');
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.userRole.deleteMany({ where: { userId } });
        for (const role of roles) {
          await tx.userRole.create({ data: { userId, roleId: role.id, assignedBy: actorId } });
        }
      });
    }

    if (typeof input.suspended === 'boolean') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { suspendedAt: input.suspended ? new Date() : null },
      });
      if (input.suspended) {
        await this.prisma.userSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'admin_suspended' },
        });
      }
    }

    await this.audit.record({
      actorId,
      actorRole: 'admin',
      action: 'admin.user_update',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      request,
      metadata: { roles: input.roles, suspended: input.suspended },
    });

    return { updated: true };
  }

  async auditLogs(page: number, pageSize: number, action?: string) {
    const where = action ? { action } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { actor: { select: { email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map((entry) => ({
        id: entry.id,
        actor: entry.actor?.email ?? null,
        actorRole: entry.actorRole,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        outcome: entry.outcome,
        ipAddress: entry.ipAddress,
        metadata: (entry.metadata ?? null) as Record<string, unknown> | null,
        createdAt: entry.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async threats(page: number, pageSize: number): Promise<Paginated<ThreatDomainDto>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.threatDomain.findMany({
        orderBy: { lastSeenAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { sources: { include: { source: true } } },
      }),
      this.prisma.threatDomain.count(),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        domain: item.domain,
        riskLevel: item.riskLevel,
        category: item.category as ThreatDomainDto['category'],
        sources: Array.from(new Set(item.sources.map((entry) => entry.source.name))),
        firstSeenAt: item.firstSeenAt.toISOString(),
        lastSeenAt: item.lastSeenAt.toISOString(),
        verified: item.verified,
        reportCount: item.reportCount,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async createThreat(
    actorId: string,
    input: { domain: string; category: string; riskLevel: RiskLevel; note?: string },
    request: Request,
  ) {
    const host = input.domain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0] ?? '';
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
      throw ApiException.badRequest('Enter a valid domain.', { domain: ['Invalid domain'] });
    }
    const domain = registrableDomain(host);
    const source = await this.prisma.threatSource.findUnique({ where: { name: 'ScamShield Manual Review' } });
    const threat = await this.prisma.threatDomain.upsert({
      where: { domain },
      create: {
        domain,
        registrableDomain: domain,
        riskLevel: input.riskLevel,
        category: input.category,
        verified: true,
        active: true,
        reportCount: 1,
      },
      update: {
        riskLevel: input.riskLevel,
        category: input.category,
        verified: true,
        active: true,
        lastSeenAt: new Date(),
      },
    });
    if (source) {
      await this.prisma.threatDomainSource.upsert({
        where: { domainId_sourceId_externalRef: { domainId: threat.id, sourceId: source.id, externalRef: `manual-${actorId}` } },
        create: {
          domainId: threat.id,
          sourceId: source.id,
          externalRef: `manual-${actorId}`,
          verified: true,
          rawEvidence: { note: input.note ?? null, addedBy: actorId },
        },
        update: { verified: true, lastSeenAt: new Date() },
      });
    }
    await this.audit.record({
      actorId,
      actorRole: 'admin',
      action: 'threat.create',
      resourceType: 'threat_domain',
      resourceId: threat.id,
      outcome: 'success',
      request,
      metadata: { domain, category: input.category, riskLevel: input.riskLevel },
    });
    return { id: threat.id, domain: threat.domain, verified: threat.verified };
  }

  async reportsList(filters: { status?: string; category?: string }, page: number, pageSize: number) {
    return this.reports.adminList(filters, page, pageSize);
  }

  async reportUpdate(id: string, moderatorId: string, input: AdminReportUpdateInput, request: Request): Promise<AdminCommunityReportDto> {
    return this.reports.adminUpdate(id, moderatorId, input, request);
  }

  async providers() {
    const health = await this.healthService.detailed();
    return { providers: health.providers, checkedAt: health.checkedAt };
  }

  async systemHealth() {
    return this.healthService.detailed();
  }
}
