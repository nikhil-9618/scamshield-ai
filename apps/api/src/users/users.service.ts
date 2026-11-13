import { Injectable } from '@nestjs/common';
import { verify as argonVerify } from '@node-rs/argon2';
import type { Request } from 'express';
import type { ActivityEventDto, SessionDto } from '@scamshield/shared-types';
import type { ProfileUpdateInput } from '@scamshield/validation';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ApiException } from '../common/http/api-exception';
import { sha256Hex } from '../common/utils/crypto.util';
import {
  AuthService,
  parseNotificationPreferences,
  parsePrivacyPreferences,
  profileInclude,
} from '../auth/auth.service';
import { loadEnv } from '../common/config/env';

@Injectable()
export class UsersService {
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async profile(userId: string) {
    return this.auth.getProfile(userId);
  }

  async updateProfile(userId: string, input: ProfileUpdateInput, request: Request) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiException.notFound('Account not found');

    const notifications = {
      ...parseNotificationPreferences(user.notificationPreferences),
      ...(input.notificationPreferences ?? {}),
    };
    const privacy = {
      ...parsePrivacyPreferences(user.privacyPreferences),
      ...(input.privacyPreferences ?? {}),
    };
    privacy.retentionDays = Math.min(
      this.env.SCAN_MAX_CONTENT_RETENTION_DAYS,
      Math.max(1, Math.trunc(privacy.retentionDays)),
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.displayName ? { displayName: input.displayName } : {}),
        ...(input.notificationPreferences ? { notificationPreferences: notifications } : {}),
        ...(input.privacyPreferences ? { privacyPreferences: privacy } : {}),
      },
    });

    await this.audit.record({
      actorId: userId,
      action: 'profile.update',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      request,
      metadata: { fields: Object.keys(input) },
    });
    return this.auth.getProfile(userId);
  }

  async sessions(userId: string, currentSessionId: string): Promise<SessionDto[]> {
    const rows = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      current: row.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string, currentSessionId: string, request: Request): Promise<void> {
    if (sessionId === currentSessionId) {
      throw ApiException.badRequest('Use “Sign out” to end the current session.');
    }
    const result = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'user_revoked' },
    });
    if (result.count === 0) throw ApiException.notFound('Session not found');
    await this.audit.record({
      actorId: userId,
      action: 'session.revoke',
      resourceType: 'session',
      resourceId: sessionId,
      outcome: 'success',
      request,
    });
  }

  async activity(userId: string): Promise<ActivityEventDto[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      resource: `${row.resourceType}${row.resourceId ? `:${row.resourceId.slice(0, 8)}` : ''}`,
      outcome: row.outcome,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async exportData(userId: string) {
    const [user, scans, reports, feedback, sessions] = await this.prisma.$transaction([
      this.prisma.user.findUnique({ where: { id: userId }, include: profileInclude }),
      this.prisma.scan.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: { result: { select: { analysis: true } } },
      }),
      this.prisma.communityReport.findMany({ where: { reporterId: userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.scanFeedback.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.userSession.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    if (!user) throw ApiException.notFound('Account not found');
    return {
      exportedAt: new Date().toISOString(),
      notice:
        'This export contains your account data and scan results. Full submitted content is only included where you explicitly consented to storage. Keep this file private.',
      profile: this.auth.buildProfile(user),
      scans: scans.map((scan) => ({
        id: scan.id,
        type: scan.type,
        status: scan.status,
        createdAt: scan.createdAt.toISOString(),
        riskScore: scan.riskScore,
        riskLevel: scan.riskLevel,
        primaryCategory: scan.primaryCategory,
        summary: scan.summary,
        inputPreview: scan.inputPreview,
        analysis: scan.result?.analysis ?? null,
        aiExplanation: scan.aiExplanation,
        deleted: Boolean(scan.deletedAt),
      })),
      communityReports: reports.map((report) => ({
        id: report.id,
        targetType: report.targetType,
        target: report.target,
        category: report.category,
        description: report.description,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
      })),
      feedback: feedback.map((entry) => ({
        scanId: entry.scanId,
        verdict: entry.verdict,
        comment: entry.comment,
        createdAt: entry.createdAt.toISOString(),
      })),
      sessions: sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        revokedAt: session.revokedAt?.toISOString() ?? null,
      })),
    };
  }

  async deleteAccount(userId: string, password: string, confirm: string, request: Request): Promise<void> {
    if (confirm !== 'DELETE') throw ApiException.badRequest('Type DELETE to confirm account deletion.');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiException.notFound('Account not found');
    const valid = await argonVerify(user.passwordHash, password).catch(() => false);
    if (!valid) {
      throw ApiException.badRequest('Your password is incorrect.', { password: ['Incorrect password'] });
    }
    const emailHash = sha256Hex(user.email);

    await this.prisma.$transaction(async (tx) => {
      // Community reports stay for moderation integrity, detached from identity.
      await tx.communityReport.updateMany({ where: { reporterId: userId }, data: { reporterId: null } });
      await tx.user.delete({ where: { id: userId } });
    });

    await this.audit.record({
      action: 'user.delete',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      request,
      metadata: { emailHash, note: 'Account and personal data deleted at user request' },
    });
  }
}
