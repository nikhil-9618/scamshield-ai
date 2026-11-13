import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Scan } from '@prisma/client';
import type { ScamCategory, ScanAnalysis, ScanType } from '@scamshield/shared-types';
import { CATEGORY_LABELS } from '@scamshield/shared-types';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiEngineClient } from './ai-engine.client';
import { UrlAnalyzerService } from './url-analyzer.service';
import { analyzeText } from './detectors/text-rules';
import { analyzeEmailHeaders, parseEmail } from './detectors/email-parser';
import { buildAnalysis } from './detectors/scoring';
import { decryptSecret } from '../common/utils/crypto.util';
import { ApiException } from '../common/http/api-exception';
import type { CategoryVotes, DetectorOutput } from './detectors/types';

function textOutput(result: ReturnType<typeof analyzeText>): DetectorOutput {
  return {
    findings: result.findings,
    extracted: result.entities,
    categoryVotes: result.categoryVotes,
    signalsEvaluated: result.signalsEvaluated,
    providersUsed: [],
    providersUnavailable: [],
    limitations: result.limitations,
  };
}

function mergeOutputs(outputs: DetectorOutput[]): DetectorOutput {
  const findings = new Map<string, DetectorOutput['findings'][number]>();
  const categoryVotes: CategoryVotes = {};
  const limitations = new Set<string>();
  const providersUsed = new Set<string>();
  const providersUnavailable = new Set<string>();
  let signalsEvaluated = 0;
  let modelConfidence: DetectorOutput['modelConfidence'] = null;
  let nlpModel: string | null = null;
  const extracted = { urls: [] as string[], domains: [] as string[], phoneNumbers: [] as string[], emailAddresses: [] as string[], upiIds: [] as string[] };
  const context: Record<string, unknown> = {};

  for (const output of outputs) {
    for (const finding of output.findings) {
      const existing = findings.get(finding.key);
      if (!existing || existing.weight < finding.weight) findings.set(finding.key, finding);
    }
    for (const [category, weight] of Object.entries(output.categoryVotes)) {
      categoryVotes[category] = (categoryVotes[category] ?? 0) + weight;
    }
    output.limitations.forEach((limitation) => limitations.add(limitation));
    output.providersUsed.forEach((provider) => providersUsed.add(provider));
    output.providersUnavailable.forEach((provider) => providersUnavailable.add(provider));
    signalsEvaluated += output.signalsEvaluated;
    extracted.urls.push(...output.extracted.urls);
    extracted.domains.push(...output.extracted.domains);
    extracted.phoneNumbers.push(...output.extracted.phoneNumbers);
    extracted.emailAddresses.push(...output.extracted.emailAddresses);
    extracted.upiIds.push(...output.extracted.upiIds);
    if (output.modelConfidence) modelConfidence = output.modelConfidence;
    if (output.nlpModel) nlpModel = output.nlpModel;
    Object.assign(context, output.context ?? {});
  }

  const unique = (values: string[]) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 25);
  return {
    findings: [...findings.values()],
    extracted: {
      urls: unique(extracted.urls),
      domains: unique(extracted.domains),
      phoneNumbers: unique(extracted.phoneNumbers),
      emailAddresses: unique(extracted.emailAddresses),
      upiIds: unique(extracted.upiIds),
    },
    categoryVotes,
    signalsEvaluated,
    providersUsed: [...providersUsed],
    providersUnavailable: [...providersUnavailable],
    limitations: [...limitations],
    modelConfidence,
    nlpModel,
    context,
  };
}

const NLP_CATEGORIES = new Set<string>(Object.keys(CATEGORY_LABELS));

@Injectable()
export class ScanProcessorService {
  private readonly logger = new Logger(ScanProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly urlAnalyzer: UrlAnalyzerService,
    private readonly ai: AiEngineClient,
    private readonly notifications: NotificationsService,
  ) {}

  async process(scanId: string): Promise<void> {
    const scan = await this.prisma.scan.findUnique({ where: { id: scanId } });
    if (!scan) return;
    if (scan.status === 'completed' || scan.status === 'failed') return;

    await this.prisma.scan.update({ where: { id: scanId }, data: { status: 'processing' } });

    try {
      const content = this.readContent(scan);
      const outputs: DetectorOutput[] = [];
      let fallbackCategory: ScamCategory = 'unknown';
      let textForModel: string | null = null;

      switch (scan.type) {
        case 'url': {
          fallbackCategory = 'phishing';
          outputs.push(await this.urlAnalyzer.analyze(content, { deep: true, userId: scan.userId }));
          break;
        }
        case 'qr': {
          fallbackCategory = 'qr_scam';
          const decoded = scan.decodedValue ?? content;
          if (/^https?:\/\//i.test(decoded)) {
            outputs.push(await this.urlAnalyzer.analyze(decoded, { deep: true, userId: scan.userId, scanType: 'qr' }));
            const qrOutput = analyzeText(`QR code destination: ${decoded}`, { scanType: 'qr' });
            outputs.push({
              ...textOutput(qrOutput),
              findings: qrOutput.findings.filter((finding) => finding.key === 'qr_payment_pressure'),
            });
          } else {
            textForModel = decoded;
            outputs.push(textOutput(analyzeText(decoded, { scanType: 'qr' })));
            const upiHandle = this.extractUpiHandle(decoded);
            if (upiHandle) {
              fallbackCategory = 'upi_scam';
              outputs.push({
                findings: [
                  {
                    key: 'qr_upi_collect_request',
                    title: 'QR code contains a UPI payment request',
                    severity: 'high',
                    weight: 34,
                    evidence: `The QR code encodes a UPI payment address (${upiHandle}). Approving it moves money out of your account; it cannot receive money for you.`,
                    method: 'heuristic',
                    source: 'qr_decoder',
                    recommendedAction: 'Do not approve this payment. Verify the payee independently; use “collect” requests only with people you know.',
                    category: 'upi_scam',
                    observedAt: new Date().toISOString(),
                  },
                ],
                extracted: { urls: [], domains: [], phoneNumbers: [], emailAddresses: [], upiIds: [upiHandle] },
                categoryVotes: { upi_scam: 34 },
                signalsEvaluated: 1,
                providersUsed: [],
                providersUnavailable: [],
                limitations: ['QR codes are decoded offline and never opened automatically.'],
              });
            }
          }
          break;
        }
        case 'email': {
          fallbackCategory = 'phishing';
          const parsed = parseEmail(content);
          const headerOutput = analyzeEmailHeaders(parsed);
          outputs.push({
            findings: headerOutput.findings,
            extracted: {
              urls: [],
              domains: [],
              phoneNumbers: [],
              emailAddresses: [parsed.from?.address, parsed.replyTo?.address].filter((value): value is string => Boolean(value)),
              upiIds: [],
            },
            categoryVotes: headerOutput.categoryVotes,
            signalsEvaluated: headerOutput.signalsEvaluated,
            providersUsed: [],
            providersUnavailable: [],
            limitations: headerOutput.limitations,
          });
          textForModel = parsed.body;
          outputs.push(textOutput(analyzeText(parsed.body, { scanType: 'email' })));
          const linkAnalysis = await this.inspectLinks(parsed.body, scan.userId, 2);
          outputs.push(linkAnalysis);
          break;
        }
        case 'message':
        case 'screenshot':
        default: {
          textForModel = content;
          outputs.push(textOutput(analyzeText(content, { scanType: scan.type === 'screenshot' ? 'screenshot' : 'message' })));
          const linkAnalysis = await this.inspectLinks(content, scan.userId, 1);
          outputs.push(linkAnalysis);
          if (scan.type === 'screenshot') {
            outputs.push({
              findings: [],
              extracted: { urls: [], domains: [], phoneNumbers: [], emailAddresses: [], upiIds: [] },
              categoryVotes: {},
              signalsEvaluated: 1,
              providersUsed: ['OCR'],
              providersUnavailable: [],
              limitations: ['Text was extracted from an image with OCR and may contain recognition errors.'],
            });
          }
          break;
        }
      }

      let merged = mergeOutputs(outputs);

      // Optional ML signal. It never overrides rules; it contributes bounded weight.
      if (textForModel && textForModel.length >= 20) {
        const classification = await this.ai.classify(textForModel);
        if (classification) {
          if (classification.probability >= 0.6) {
            const category = NLP_CATEGORIES.has(classification.label) ? (classification.label as ScamCategory) : undefined;
            merged.findings.push({
              key: 'nlp_scam_signal',
              title: 'Language model flagged scam-like wording',
              severity: classification.probability >= 0.85 ? 'high' : 'medium',
              weight: Math.round(Math.min(0.9, classification.probability) * 24),
              evidence: `A statistical text classifier (${classification.model}) judged this content similar to known scam messages. The model is trained on synthetic examples and is not calibrated for real-world probabilities.`,
              method: 'nlp_model',
              source: 'scamshield_nlp',
              recommendedAction: 'Combine this signal with the specific findings above before deciding what to do.',
              category,
              observedAt: new Date().toISOString(),
            });
            merged.categoryVotes = {
              ...merged.categoryVotes,
              ...(category ? { [category]: (merged.categoryVotes[category] ?? 0) + 12 } : {}),
            };
            merged.modelConfidence = {
              label: classification.probability >= 0.85 ? 'high' : 'medium',
              calibration: 'uncalibrated',
              note: 'The classifier was evaluated on a synthetic dataset only. Treat this as a supporting signal, not a probability that this item is a scam.',
            };
            merged.nlpModel = classification.model;
          }
        }
      }

      const analysis = buildAnalysis({
        findings: merged.findings,
        extracted: merged.extracted,
        categoryVotes: merged.categoryVotes,
        signalsEvaluated: Math.max(merged.signalsEvaluated, 1),
        providersUsed: merged.providersUsed,
        providersUnavailable: merged.providersUnavailable,
        limitations: merged.limitations,
        fallbackCategory,
        modelConfidence: merged.modelConfidence,
        nlpModel: merged.nlpModel,
      });

      await this.persist(scan, analysis);

      if (scan.userId && (analysis.riskLevel === 'high' || analysis.riskLevel === 'critical')) {
        await this.notifications.create(scan.userId, {
          type: 'scan_high_risk',
          title: `${analysis.riskLevel === 'critical' ? 'Critical' : 'High'}-risk ${scan.type} detected`,
          body: `A recent scan scored ${analysis.riskScore}/100. Review the findings and recommended actions.`,
          metadata: { scanId: scan.id, riskLevel: analysis.riskLevel },
          email: { kind: 'scan', riskLevel: analysis.riskLevel, scanId: scan.id },
        });
      }
    } catch (error) {
      const message =
        error instanceof ApiException
          ? error.message
          : 'The scan could not be completed because of an internal error. Try again, or use a different input type.';
      const code = error instanceof ApiException ? error.code : 'SCAN_FAILED';
      this.logger.error(`Scan ${scanId} failed (${code}): ${error instanceof Error ? error.message : 'unknown'}`);
      await this.prisma.scan.update({
        where: { id: scanId },
        data: {
          status: 'failed',
          errorCode: code,
          errorMessage: message.slice(0, 500),
          inputEncrypted: null,
          updatedAt: new Date(),
        },
      });
    }
  }

  private readContent(scan: Scan): string {
    if (scan.inputEncrypted) {
      try {
        return decryptSecret(scan.inputEncrypted);
      } catch {
        throw new ApiException({ code: 'SCAN_FAILED', message: 'Stored scan content could not be read. Please submit it again.', status: 500 });
      }
    }
    if (scan.decodedValue) return scan.decodedValue;
    // Content was already purged (retention or a crash); make the failure explicit.
    throw new ApiException({
      code: 'SCAN_FAILED',
      message: 'This scan no longer has its input available. Please submit it again.',
      status: 410,
    });
  }

  private async inspectLinks(text: string, userId: string | null, limit: number): Promise<DetectorOutput> {
    const urls = Array.from(new Set((text.match(/https?:\/\/[^\s<>"')]+/gi) ?? []).map((url) => url.replace(/[.,;:!?)\]]+$/, '')))).slice(0, limit);
    const outputs: DetectorOutput[] = [];
    for (const url of urls) {
      try {
        outputs.push(await this.urlAnalyzer.analyze(url, { deep: false, userId }));
      } catch (error) {
        outputs.push({
          findings: [],
          extracted: { urls: [url], domains: [], phoneNumbers: [], emailAddresses: [], upiIds: [] },
          categoryVotes: {},
          signalsEvaluated: 1,
          providersUsed: [],
          providersUnavailable: ['URL analysis'],
          limitations: [
            error instanceof ApiException
              ? `One of the links could not be checked: ${error.message}`
              : 'One of the links could not be checked.',
          ],
        });
      }
    }
    if (outputs.length === 0) {
      return {
        findings: [],
        extracted: { urls: [], domains: [], phoneNumbers: [], emailAddresses: [], upiIds: [] },
        categoryVotes: {},
        signalsEvaluated: 0,
        providersUsed: [],
        providersUnavailable: [],
        limitations: [],
      };
    }
    return mergeOutputs(outputs);
  }

  private extractUpiHandle(value: string): string | null {
    const direct = value.match(/[A-Za-z0-9._-]{2,}@(?:oksbi|okhdfcbank|okicici|okaxis|ybl|ibl|axl|apl|paytm|upi|sbi|hdfcbank|icici|axisbank|kotak|yesbank|airtel)/);
    if (direct?.[0]) return direct[0];
    try {
      const parsed = new URL(value);
      for (const key of ['pa', 'pn', 'payee']) {
        const param = parsed.searchParams.get(key);
        if (param && param.includes('@')) return param;
      }
    } catch {
      /* not a URL */
    }
    return null;
  }

  private async persist(scan: Scan, analysis: ScanAnalysis): Promise<void> {
    const retentionUntil =
      scan.contentConsent && scan.contentRetentionUntil ? scan.contentRetentionUntil : null;

    await this.prisma.$transaction(async (tx) => {
      const resultData = {
        riskScore: analysis.riskScore,
        riskLevel: analysis.riskLevel,
        primaryCategory: analysis.primaryCategory,
        summary: analysis.summary,
        extractedEntities: analysis.extracted as unknown as Prisma.InputJsonValue,
        evidenceCoverage: analysis.evidenceCoverage as unknown as Prisma.InputJsonValue,
        modelConfidence: (analysis.modelConfidence ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
        engine: analysis.engine as unknown as Prisma.InputJsonValue,
        limitations: analysis.limitations,
        analysis: analysis as unknown as Prisma.InputJsonValue,
      };
      await tx.scanResult.upsert({
        where: { scanId: scan.id },
        create: { scanId: scan.id, ...resultData },
        update: resultData,
      });
      await tx.detectionIndicator.deleteMany({ where: { scanId: scan.id } });
      if (analysis.findings.length > 0) {
        await tx.detectionIndicator.createMany({
          data: analysis.findings.map((finding) => ({
            scanId: scan.id,
            key: finding.key,
            title: finding.title,
            severity: finding.severity,
            evidence: finding.evidence,
            detectionMethod: finding.detectionMethod,
            source: finding.source,
            recommendedAction: finding.recommendedAction,
            scoreImpact: finding.scoreImpact,
            observedAt: new Date(finding.observedAt),
          })),
        });
      }
      await tx.scan.update({
        where: { id: scan.id },
        data: {
          status: 'completed',
          riskScore: analysis.riskScore,
          riskLevel: analysis.riskLevel,
          primaryCategory: analysis.primaryCategory,
          summary: analysis.summary,
          rulesVersion: analysis.engine.rulesVersion,
          scorerVersion: analysis.engine.scorerVersion,
          errorCode: null,
          errorMessage: null,
          // Without explicit consent, input is purged as soon as the scan completes.
          inputEncrypted: scan.contentConsent ? scan.inputEncrypted : null,
          contentRetentionUntil: retentionUntil,
        },
      });
    });
  }
}

export function scanTypeLabel(type: ScanType): string {
  return type === 'url' ? 'URL' : type.charAt(0).toUpperCase() + type.slice(1);
}
