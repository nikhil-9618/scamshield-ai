import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import type {
  AdminCommunityReportDto,
  CommunityReportDto,
  Paginated,
  ScamCategory,
  ThreatDomainDto,
} from '@scamshield/shared-types';
import type { AdminReportUpdateInput, CommunityReportInput, PaginationInput } from '@scamshield/validation';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApiException } from '../common/http/api-exception';
import { maskEmail, maskPhone, sha256Hex } from '../common/utils/crypto.util';
import { registrableDomain } from '../scans/detectors/brands';

interface NormalizedTarget {
  target: string;
  display: string;
  hash: string;
}

function normalizeTarget(type: CommunityReportInput['targetType'], raw: string): NormalizedTarget {
  const trimmed = raw.trim();
  if (type === 'domain') {
    const host = trimmed
      .replace(/^https?:\/\//i, '')
      .split('/')[0]!
      .replace(/^www\./i, '')
      .toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) {
      throw ApiException.badRequest('Enter a valid domain, for example example-bank.com.', {
        target: ['Enter a valid domain'],
      });
    }
    const domain = registrableDomain(host);
    return { target: domain, display: domain, hash: sha256Hex(`domain:${domain}`) };
  }
  if (type === 'url') {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw ApiException.badRequest('Enter a full URL including https://', { target: ['Enter a valid URL'] });
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw ApiException.badRequest('Only http(s) URLs can be reported.', { target: ['Unsupported protocol'] });
    }
    // Query strings often contain tokens; keep only origin + path.
    const clean = `${url.origin}${url.pathname}`;
    return { target: clean.slice(0, 300), display: clean.slice(0, 300), hash: sha256Hex(`url:${clean}`) };
  }
  if (type === 'phone') {
    const digits = trimmed.replace(/[^\d]/g, '');
    if (digits.length < 8 || digits.length > 15) {
      throw ApiException.badRequest('Enter a valid phone number, including country code if possible.', {
        target: ['Enter a valid phone number'],
      });
    }
    return { target: digits, display: maskPhone(digits), hash: sha256Hex(`phone:${digits}`) };
  }
  if (type === 'email') {
    const email = trimmed.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw ApiException.badRequest('Enter a valid email address.', { target: ['Enter a valid email address'] });
    }
    return { target: email, display: maskEmail(email), hash: sha256Hex(`email:${email}`) };
  }
  // Message reports are stored as a hash plus the free-text description.
  const hash = sha256Hex(`message:${trimmed.toLowerCase()}`);
  return { target: `message-sha256:${hash.slice(0, 16)}`, display: 'Reported message (hashed)', hash };
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, input: CommunityReportInput, request: Request): Promise<CommunityReportDto> {
    const normalized = normalizeTarget(input.targetType, input.target);

    const existing = await this.prisma.communityReport.findFirst({
      where: {
        targetHash: normalized.hash,
        createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
        status: { in: ['pending', 'verified'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const report = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.communityReport.update({
          where: { id: existing.id },
          data: { verificationCount: { increment: 1 } },
        });
      }
      return tx.communityReport.create({
        data: {
          reporterId: userId,
          targetType: input.targetType,
          target: normalized.target.slice(0, 300),
          targetHash: normalized.hash,
          category: input.category,
          description: input.description,
          evidenceUrls: input.evidenceUrls ?? [],
          status: existing ? 'duplicate' : 'pending',
          duplicateOfId: existing?.id ?? null,
        },
      });
    });

    await this.audit.record({
      actorId: userId,
      action: 'report.create',
      resourceType: 'community_report',
      resourceId: report.id,
      outcome: 'success',
      request,
      metadata: { targetType: input.targetType, duplicate: Boolean(existing) },
    });

    return this.toDto(report);
  }

  async listMine(userId: string, page: number, pageSize: number): Promise<Paginated<CommunityReportDto>> {
    const where = { reporterId: userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.communityReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.communityReport.count({ where }),
    ]);
    return {
      items: items.map((item) => this.toDto(item)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  // --------------------------------------------------------------------- threats

  async threats(query: string, page: number, pageSize: number): Promise<Paginated<ThreatDomainDto>> {
    const where = {
      verified: true,
      active: true,
      ...(query ? { domain: { contains: query.toLowerCase() } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.threatDomain.findMany({
        where,
        orderBy: { lastSeenAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { sources: { include: { source: true } }, _count: { select: { reports: true } } },
      }),
      this.prisma.threatDomain.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        domain: item.domain,
        riskLevel: item.riskLevel,
        category: item.category as ScamCategory,
        sources: Array.from(new Set(item.sources.map((source) => source.source.name))),
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

  async lookupDomain(domain: string) {
    const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0]?.replace(/^www\./, '') ?? '';
    const record = await this.prisma.threatDomain.findFirst({
      where: { domain: clean, verified: true, active: true },
      include: { sources: { include: { source: true } } },
    });
    if (!record) {
      return {
        domain: clean,
        found: false,
        riskLevel: null,
        category: null,
        sources: [],
        reportCount: 0,
        lastSeenAt: null,
        note: 'No verified threat record. That does not mean the domain is safe.',
      };
    }
    return {
      domain: record.domain,
      found: true,
      riskLevel: record.riskLevel,
      category: record.category,
      sources: Array.from(new Set(record.sources.map((entry) => entry.source.name))),
      reportCount: record.reportCount,
      lastSeenAt: record.lastSeenAt.toISOString(),
      note: 'Verified by ScamShield moderation or a threat-intelligence source.',
    };
  }

  // ----------------------------------------------------------------------- admin

  async adminList(
    filters: { status?: string; category?: string },
    page: number,
    pageSize: number,
  ): Promise<Paginated<AdminCommunityReportDto>> {
    const where = {
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.category ? { category: filters.category } : {}),
    };
    const [items, total, pending] = await this.prisma.$transaction([
      this.prisma.communityReport.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { reviewedBy: { select: { email: true } }, reporter: { select: { email: true } } },
      }),
      this.prisma.communityReport.count({ where }),
      this.prisma.communityReport.count({ where: { status: 'pending' } }),
    ]);
    return {
      items: items.map((item) => ({
        ...this.toDto(item, item.reviewedBy?.email ?? null),
        reporterEmail: item.reporter?.email ?? null,
        moderatorNote: item.moderatorNote,
        reviewedAt: item.reviewedAt?.toISOString() ?? null,
        duplicateOfId: item.duplicateOfId,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async adminUpdate(
    reportId: string,
    moderatorId: string,
    input: AdminReportUpdateInput,
    request: Request,
  ): Promise<AdminCommunityReportDto> {
    const report = await this.prisma.communityReport.findUnique({ where: { id: reportId } });
    if (!report) throw ApiException.notFound('Report not found');

    if (input.status === 'duplicate' && !input.duplicateOfId) {
      throw ApiException.badRequest('Choose the report this duplicates.', { duplicateOfId: ['Required for duplicate status'] });
    }
    if (input.duplicateOfId) {
      const parent = await this.prisma.communityReport.findUnique({ where: { id: input.duplicateOfId } });
      if (!parent) throw ApiException.badRequest('The parent report could not be found.', { duplicateOfId: ['Invalid report'] });
      if (parent.id === reportId) throw ApiException.badRequest('A report cannot duplicate itself.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.communityReport.update({
        where: { id: reportId },
        data: {
          status: input.status,
          moderatorNote: input.moderatorNote ?? null,
          duplicateOfId: input.status === 'duplicate' ? (input.duplicateOfId ?? null) : null,
          reviewedById: moderatorId,
          reviewedAt: new Date(),
        },
        include: { reporter: { select: { email: true } }, reviewedBy: { select: { email: true } } },
      });

      if (input.status === 'verified' && input.addToThreatIntel) {
        const host =
          report.targetType === 'domain'
            ? report.target
            : report.targetType === 'url'
              ? (() => {
                  try {
                    return new URL(report.target).hostname;
                  } catch {
                    return null;
                  }
                })()
              : null;
        if (host) {
          const domain = registrableDomain(host);
          const threat = await tx.threatDomain.upsert({
            where: { domain },
            create: {
              domain,
              registrableDomain: domain,
              riskLevel: 'high',
              category: report.category,
              verified: true,
              reportCount: 1,
            },
            update: {
              category: report.category,
              riskLevel: 'high',
              verified: true,
              active: true,
              lastSeenAt: new Date(),
              reportCount: { increment: 1 },
            },
          });
          await tx.communityReport.update({ where: { id: reportId }, data: { threatDomainId: threat.id } });
          const sources = await tx.threatSource.findMany({
            where: { name: { in: ['ScamShield Community', 'ScamShield Manual Review'] } },
          });
          for (const source of sources) {
            const existingSource = await tx.threatDomainSource.findFirst({
              where: { domainId: threat.id, sourceId: source.id, externalRef: reportId },
            });
            if (!existingSource) {
              await tx.threatDomainSource.create({
                data: {
                  domainId: threat.id,
                  sourceId: source.id,
                  externalRef: reportId,
                  verified: source.name === 'ScamShield Manual Review',
                  rawEvidence: { reportId, category: report.category, verifiedBy: moderatorId },
                },
              });
            }
          }
        }
      }

      return result;
    });

    await this.audit.record({
      actorId: moderatorId,
      actorRole: 'moderator',
      action: 'report.moderate',
      resourceType: 'community_report',
      resourceId: reportId,
      outcome: 'success',
      request,
      metadata: { status: input.status, addToThreatIntel: input.addToThreatIntel },
    });

    if (updated.reporterId) {
      await this.notifications.create(updated.reporterId, {
        type: 'report_status',
        title: `Community report ${input.status}`,
        body: `Your report about ${this.toDto(updated).target} was reviewed and marked ${input.status}.`,
        metadata: { reportId },
        email: { kind: 'report', status: input.status, category: report.category },
      });
    }

    return {
      ...this.toDto(updated, updated.reviewedBy?.email ?? null),
      reporterEmail: updated.reporter?.email ?? null,
      moderatorNote: updated.moderatorNote,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
      duplicateOfId: updated.duplicateOfId,
    };
  }

  private toDto(
    report: {
      id: string;
      targetType: string;
      target: string;
      category: string;
      description: string;
      status: string;
      verificationCount: number;
      createdAt: Date;
      updatedAt: Date;
    },
    _reviewerEmail?: string | null,
  ): CommunityReportDto {
    let display = report.target;
    if (report.targetType === 'phone') display = maskPhone(report.target);
    if (report.targetType === 'email') display = maskEmail(report.target);
    if (report.targetType === 'message') display = 'Reported message (hashed)';
    return {
      id: report.id,
      targetType: report.targetType as CommunityReportDto['targetType'],
      target: display,
      category: report.category as ScamCategory,
      description: report.description,
      status: report.status as CommunityReportDto['status'],
      verificationCount: report.verificationCount,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }
}
