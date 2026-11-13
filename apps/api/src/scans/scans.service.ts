import { Injectable, Logger } from '@nestjs/common';
import { validateDestination } from './detectors/ssrf';
import type { Request } from 'express';
import type {
  AiExplanation,
  ScanDetail,
  ScanFeedbackDto,
  ScanRecord,
  ScamCategory,
  Paginated,
} from '@scamshield/shared-types';
import { AI_EXPLANATION_DISCLAIMER } from '@scamshield/shared-types';
import type { ScanListQueryInput } from '@scamshield/validation';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ApiException } from '../common/http/api-exception';
import { encryptSecret, sha256Hex } from '../common/utils/crypto.util';
import { buildPreview } from './detectors/extract';
import { ScanQueueService } from './scan-queue.service';
import { AiEngineClient } from './ai-engine.client';
import { UrlAnalyzerService } from './url-analyzer.service';
import { buildExplanationRequest, sanitizeExplanationText, templateExplanation } from './detectors/explanations';
import { parsePrivacyPreferences, profileInclude } from '../auth/auth.service';
import type { AuthUser } from '../common/security/auth-user';
import { loadEnv } from '../common/config/env';
import type { RawFinding } from './detectors/types';
import { buildAnalysis } from './detectors/scoring';

interface PersistedAnalysis {
  analysis: unknown;
}

@Injectable()
export class ScansService {
  private readonly logger = new Logger(ScansService.name);
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ScanQueueService,
    private readonly ai: AiEngineClient,
    private readonly audit: AuditService,
    private readonly urlAnalyzer: UrlAnalyzerService,
  ) {}

  // ------------------------------------------------------------------- creation

  async scanMessage(user: AuthUser, input: { content: string; channel: string; consentToStore: boolean }, request: Request): Promise<ScanDetail> {
    return this.create(user, {
      type: 'message',
      content: input.content,
      preview: buildPreview(input.content),
      channel: input.channel,
      consentToStore: input.consentToStore,
      request,
    });
  }

  async scanUrl(user: AuthUser, input: { url: string; consentToStore: boolean }, request: Request): Promise<ScanDetail> {
    const normalized = input.url.trim();
    // Reject unsafe destinations before a scan record or quota unit is created.
    // The processor validates again for every redirect hop.
    await validateDestination(normalized);
    return this.create(user, {
      type: 'url',
      content: normalized,
      preview: buildPreview(normalized, 200),
      consentToStore: input.consentToStore,
      request,
    });
  }

  async scanEmail(user: AuthUser, raw: string, consentToStore: boolean, request: Request): Promise<ScanDetail> {
    const preview = buildPreview(raw, 240);
    return this.create(user, {
      type: 'email',
      content: raw,
      preview,
      consentToStore,
      request,
    });
  }

  async scanScreenshot(user: AuthUser, buffer: Buffer, mimeType: string, consentToStore: boolean, request: Request): Promise<ScanDetail> {
    const ocr = await this.ai.ocr(buffer, mimeType);
    if (!ocr.ok) {
      throw new ApiException({
        code: 'OCR_UNAVAILABLE',
        message:
          ocr.reason?.includes('No readable text')
            ? 'No readable text was found in that screenshot. Try a sharper, straight-on image.'
            : 'The screenshot could not be read right now. The OCR engine is unavailable, so no result would be honest.',
        status: 422,
      });
    }
    return this.create(user, {
      type: 'screenshot',
      content: ocr.text,
      preview: buildPreview(ocr.text),
      consentToStore,
      request,
    });
  }

  async scanQr(user: AuthUser, buffer: Buffer, mimeType: string, request: Request): Promise<ScanDetail> {
    const decoded = await this.ai.decodeQr(buffer, mimeType);
    if (!decoded.ok) {
      throw new ApiException({
        code: 'QR_DECODE_FAILED',
        message: decoded.reason ?? 'No QR code could be decoded from that image.',
        status: 422,
      });
    }
    return this.create(user, {
      type: 'qr',
      content: decoded.value,
      preview: buildPreview(decoded.value, 240),
      decodedValue: decoded.value,
      consentToStore: true,
      request,
    });
  }

  private async create(
    user: AuthUser,
    input: {
      type: 'message' | 'url' | 'screenshot' | 'qr' | 'email';
      content: string;
      preview: string;
      channel?: string;
      decodedValue?: string;
      consentToStore: boolean;
      request: Request;
    },
  ): Promise<ScanDetail> {
    const quota = await this.quota(user.id);
    if (quota.used >= quota.limit) {
      throw new ApiException({
        code: 'QUOTA_EXCEEDED',
        message: `You have reached your daily limit of ${quota.limit} scans. Try again tomorrow or upgrade your plan.`,
        status: 429,
      });
    }

    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { privacyPreferences: true },
    });
    const privacy = parsePrivacyPreferences(profile?.privacyPreferences ?? null);
    const retentionDays = Math.min(privacy.retentionDays, this.env.SCAN_MAX_CONTENT_RETENTION_DAYS);
    const consent = input.consentToStore;

    const scan = await this.prisma.scan.create({
      data: {
        userId: user.id,
        type: input.type,
        status: 'queued',
        channel: input.channel ?? null,
        inputHash: sha256Hex(input.content),
        inputPreview: input.preview,
        inputEncrypted: encryptSecret(input.content),
        inputLength: input.content.length,
        contentConsent: consent,
        decodedValue: input.decodedValue?.slice(0, 4096) ?? null,
        contentRetentionUntil: consent
          ? new Date(Date.now() + retentionDays * 86_400_000)
          : new Date(Date.now() + 15 * 60_000),
      },
    });

    await this.queue.run(scan.id);

    const detail = await this.getById(user, scan.id);
    await this.audit.record({
      actorId: user.id,
      actorRole: user.roles[0] ?? 'user',
      action: 'scan.create',
      resourceType: 'scan',
      resourceId: scan.id,
      outcome: scan.status === 'failed' ? 'failure' : 'success',
      request: input.request,
      metadata: { type: input.type, riskLevel: scan.riskLevel, consent },
    });
    return detail;
  }

  async quota(userId: string): Promise<{ limit: number; used: number }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: profileInclude,
    });
    if (!user) throw ApiException.unauthorized('Account not found');
    const limit = user.subscriptions[0]?.plan.dailyScanLimit ?? 10;
    const used = await this.prisma.scan.count({
      where: { userId, deletedAt: null, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    return { limit, used };
  }

  // ------------------------------------------------------------------ retrieval

  async list(userId: string, query: ScanListQueryInput): Promise<Paginated<ScanRecord>> {
    const where = {
      userId,
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.scan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.scan.count({ where }),
    ]);
    return {
      items: items.map((scan) => this.toRecord(scan)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getById(user: AuthUser, id: string): Promise<ScanDetail> {
    const scan = await this.prisma.scan.findFirst({
      where: { id, deletedAt: null, ...(user.roles.includes('admin') ? {} : { userId: user.id }) },
      include: { result: true, feedback: true },
    });
    if (!scan) throw ApiException.notFound('Scan not found');
    return this.toDetail(scan);
  }

  async deleteScan(user: AuthUser, id: string, request: Request): Promise<void> {
    const scan = await this.prisma.scan.findFirst({ where: { id, userId: user.id, deletedAt: null } });
    if (!scan) throw ApiException.notFound('Scan not found');
    await this.prisma.$transaction([
      this.prisma.scanResult.deleteMany({ where: { scanId: id } }),
      this.prisma.detectionIndicator.deleteMany({ where: { scanId: id } }),
      this.prisma.scan.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          inputEncrypted: null,
          inputPreview: null,
          aiExplanation: null,
          decodedValue: null,
          summary: 'Scan deleted by the account owner.',
        },
      }),
    ]);
    await this.audit.record({
      actorId: user.id,
      action: 'scan.delete',
      resourceType: 'scan',
      resourceId: id,
      outcome: 'success',
      request,
    });
  }

  async deleteAll(user: AuthUser, request: Request): Promise<number> {
    const scans = await this.prisma.scan.findMany({
      where: { userId: user.id, deletedAt: null },
      select: { id: true },
    });
    const ids = scans.map((scan) => scan.id);
    if (ids.length === 0) return 0;
    await this.prisma.$transaction([
      this.prisma.scanResult.deleteMany({ where: { scanId: { in: ids } } }),
      this.prisma.detectionIndicator.deleteMany({ where: { scanId: { in: ids } } }),
      this.prisma.scan.updateMany({
        where: { id: { in: ids } },
        data: {
          deletedAt: new Date(),
          inputEncrypted: null,
          inputPreview: null,
          aiExplanation: null,
          decodedValue: null,
          summary: 'Scan deleted by the account owner.',
        },
      }),
    ]);
    await this.audit.record({
      actorId: user.id,
      action: 'scan.delete_all',
      resourceType: 'scan',
      outcome: 'success',
      request,
      metadata: { count: ids.length },
    });
    return ids.length;
  }

  async submitFeedback(user: AuthUser, scanId: string, input: { verdict: string; comment?: string }): Promise<ScanFeedbackDto> {
    const scan = await this.prisma.scan.findFirst({ where: { id: scanId, userId: user.id, deletedAt: null } });
    if (!scan) throw ApiException.notFound('Scan not found');
    const feedback = await this.prisma.scanFeedback.upsert({
      where: { scanId },
      create: { scanId, userId: user.id, verdict: input.verdict, comment: input.comment ?? null },
      update: { verdict: input.verdict, comment: input.comment ?? null },
    });
    return {
      id: feedback.id,
      verdict: feedback.verdict as ScanFeedbackDto['verdict'],
      comment: feedback.comment,
      createdAt: feedback.createdAt.toISOString(),
    };
  }

  // ------------------------------------------------------------------ explanation

  async explain(user: AuthUser, scanId: string): Promise<AiExplanation> {
    const scan = await this.prisma.scan.findFirst({
      where: { id: scanId, deletedAt: null, userId: user.id },
      include: { result: true },
    });
    if (!scan) throw ApiException.notFound('Scan not found');
    if (scan.status !== 'completed' || !scan.result) {
      throw ApiException.badRequest('There is no completed result to explain yet.');
    }
    if (scan.aiExplanation && scan.aiExplainedAt) {
      return {
        text: scan.aiExplanation,
        generator: scan.aiGenerator === 'llm' ? 'llm' : 'template',
        model: scan.aiModel,
        generatedAt: scan.aiExplainedAt.toISOString(),
        disclaimer: AI_EXPLANATION_DISCLAIMER,
      };
    }

    const analysis = (scan.result as unknown as PersistedAnalysis).analysis as import('@scamshield/shared-types').ScanAnalysis;
    const request = buildExplanationRequest(scan.type, analysis);
    let explanation: AiExplanation | null = null;

    const modelResult = await this.ai.explain(request);
    if (modelResult?.generator === 'llm') {
      const sanitized = sanitizeExplanationText(modelResult.text);
      if (sanitized) {
        explanation = {
          text: sanitized,
          generator: 'llm',
          model: modelResult.model ?? 'llm',
          generatedAt: new Date().toISOString(),
          disclaimer: AI_EXPLANATION_DISCLAIMER,
        };
      }
    }

    if (!explanation) {
      explanation = templateExplanation(scan.type, analysis);
    }

    const updatedAnalysis = { ...analysis, engine: { ...analysis.engine, aiExplanation: explanation.generator === 'llm' } };
    await this.prisma.$transaction([
      this.prisma.scan.update({
        where: { id: scan.id },
        data: {
          aiExplanation: explanation.text,
          aiGenerator: explanation.generator,
          aiModel: explanation.model,
          aiExplainedAt: new Date(explanation.generatedAt),
        },
      }),
      this.prisma.scanResult.update({
        where: { scanId: scan.id },
        data: { analysis: updatedAnalysis as never },
      }),
    ]);

    await this.audit.record({
      actorId: user.id,
      action: 'scan.explain',
      resourceType: 'scan',
      resourceId: scan.id,
      outcome: 'success',
      metadata: { generator: explanation.generator },
    });

    return explanation;
  }

  // ---------------------------------------------------------------------- helpers

  private toRecord(scan: {
    id: string;
    type: string;
    status: string;
    riskScore: number | null;
    riskLevel: string | null;
    primaryCategory: string | null;
    summary: string;
    inputPreview: string | null;
    contentConsent: boolean;
    inputEncrypted: string | null;
    aiExplanation: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ScanRecord {
    return {
      id: scan.id,
      type: scan.type as ScanRecord['type'],
      status: scan.status as ScanRecord['status'],
      riskScore: scan.riskScore,
      riskLevel: (scan.riskLevel as ScanRecord['riskLevel']) ?? null,
      primaryCategory: (scan.primaryCategory as ScamCategory) ?? null,
      summary: scan.summary,
      inputPreview: scan.inputPreview,
      hasStoredContent: scan.contentConsent && Boolean(scan.inputEncrypted),
      hasAiExplanation: Boolean(scan.aiExplanation),
      createdAt: scan.createdAt.toISOString(),
      updatedAt: scan.updatedAt.toISOString(),
    };
  }

  private toDetail(scan: {
    id: string;
    type: string;
    status: string;
    riskScore: number | null;
    riskLevel: string | null;
    primaryCategory: string | null;
    summary: string;
    inputPreview: string | null;
    contentConsent: boolean;
    inputEncrypted: string | null;
    aiExplanation: string | null;
    aiGenerator: string | null;
    aiModel: string | null;
    aiExplainedAt: Date | null;
    decodedValue: string | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    result: { analysis: unknown } | null;
    feedback: { id: string; verdict: string; comment: string | null; createdAt: Date } | null;
  }): ScanDetail {
    const base = this.toRecord(scan);
    const analysis = scan.result ? ((scan.result.analysis ?? null) as ScanDetail['analysis']) : null;
    return {
      ...base,
      analysis,
      aiExplanation:
        scan.aiExplanation && scan.aiExplainedAt
          ? {
              text: scan.aiExplanation,
              generator: scan.aiGenerator === 'llm' ? 'llm' : 'template',
              model: scan.aiModel,
              generatedAt: scan.aiExplainedAt.toISOString(),
              disclaimer: AI_EXPLANATION_DISCLAIMER,
            }
          : null,
      decodedValue: scan.decodedValue,
      errorMessage: scan.errorMessage,
      feedback: scan.feedback
        ? {
            id: scan.feedback.id,
            verdict: scan.feedback.verdict as ScanFeedbackDto['verdict'],
            comment: scan.feedback.comment,
            createdAt: scan.feedback.createdAt.toISOString(),
          }
        : null,
    };
  }

  /** Used by the URL tab to show a structural preview before a full scan is requested. */
  async previewUrl(url: string): Promise<{ host: string | null; findings: number; blockReason: string | null }> {
    try {
      const structure = await this.urlAnalyzer.analyze(url, { deep: false, userId: null });
      const above = structure.findings.filter((finding) => finding.weight >= 30).length;
      return { host: new URL(url).hostname, findings: above, blockReason: null };
    } catch (error) {
      return { host: null, findings: 0, blockReason: error instanceof Error ? error.message : 'invalid URL' };
    }
  }

  /** Fallback path used by tests to score raw findings without persistence. */
  scoreFindings(findings: RawFinding[], fallback: ScamCategory = 'unknown') {
    return buildAnalysis({
      findings,
      extracted: { urls: [], domains: [], phoneNumbers: [], emailAddresses: [], upiIds: [] },
      categoryVotes: {},
      signalsEvaluated: findings.length,
      providersUsed: [],
      providersUnavailable: [],
      limitations: [],
      fallbackCategory: fallback,
    });
  }
}
