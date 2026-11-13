import {
  CATEGORY_LABELS,
  riskLevelFromScore,
  SCORE_DISCLAIMER,
  type EvidenceCoverage,
  type Finding,
  type FindingSeverity,
  type ScamCategory,
  type ScanAnalysis,
} from '@scamshield/shared-types';
import type { BuildAnalysisInput, CategoryVotes, RawFinding } from './types';

export const RULES_VERSION = '2026.11.1';
export const SCORER_VERSION = '1.0.0';

const DIMINISHING_FACTOR = 0.85;
const CORROBORATION_BONUS = 5;

const SEVERITY_ORDER: FindingSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];

/**
 * Transparent aggregation:
 *  - findings are ordered by base weight and each subsequent signal contributes
 *    progressively less (diminishing returns) so one rule cannot dominate;
 *  - independent-source corroboration adds a small bounded bonus;
 *  - the result is bounded to 0..100 and mapped to product thresholds.
 *
 * The output is a product heuristic, not a probability. Every contribution is
 * exposed per finding so users can see exactly why a score was assigned.
 */
export function aggregateScore(findings: RawFinding[]): { score: number; contributions: Map<RawFinding, number> } {
  const ordered = [...findings].sort((a, b) => b.weight - a.weight);
  const contributions = new Map<RawFinding, number>();
  let total = 0;
  ordered.forEach((finding, index) => {
    const impact = Math.max(0, Math.round(finding.weight * DIMINISHING_FACTOR ** index));
    contributions.set(finding, impact);
    total += impact;
  });

  const sources = new Set(findings.filter((finding) => finding.weight > 0).map((finding) => finding.source));
  if (sources.size >= 3 && total > 0) total += CORROBORATION_BONUS;

  return { score: Math.max(0, Math.min(100, Math.round(total))), contributions };
}

export function pickPrimaryCategory(votes: CategoryVotes, fallback: ScamCategory = 'unknown'): ScamCategory {
  const entries = Object.entries(votes).filter(([, value]) => value > 0);
  if (entries.length === 0) return fallback;
  entries.sort((a, b) => b[1] - a[1]);
  const winner = entries[0]?.[0];
  return isScamCategory(winner) ? winner : fallback;
}

function isScamCategory(value: string | undefined): value is ScamCategory {
  return Boolean(value && value in CATEGORY_LABELS);
}

function toFinding(finding: RawFinding, impact: number, index: number): Finding {
  return {
    key: finding.key,
    title: finding.title,
    severity: finding.severity,
    evidence: finding.evidence,
    detectionMethod: finding.method,
    source: finding.source,
    observedAt: finding.observedAt ?? new Date(Date.now() + index).toISOString(),
    recommendedAction: finding.recommendedAction,
    scoreImpact: impact,
  };
}

function summarize(score: number, category: ScamCategory, findings: Finding[]): string {
  const label = CATEGORY_LABELS[category];
  if (findings.length === 0) {
    return 'No strong scam indicators were found in the material reviewed. This is not a guarantee of safety — verify any request for money, codes or personal details independently.';
  }
  const top = findings
    .slice()
    .sort((a, b) => b.scoreImpact - a.scoreImpact)
    .slice(0, 2)
    .map((finding) => finding.title.toLowerCase());
  const joined = top.length === 2 ? `${top[0]} and ${top[1]}` : (top[0] ?? 'suspicious signals');
  if (score >= 75) {
    return `Critical risk. This looks consistent with ${label.toLowerCase()}, driven by ${joined}. Do not send money, codes or documents; verify through an official channel you find yourself.`;
  }
  if (score >= 50) {
    return `High risk. Multiple indicators consistent with ${label.toLowerCase()} were found, including ${joined}. Treat the request as unsafe until independently verified.`;
  }
  if (score >= 25) {
    return `Some suspicious elements were found, including ${joined}. Slow down and verify the sender through an official channel before acting.`;
  }
  return `Only weak signals were found${findings.length > 0 ? `, such as ${joined}` : ''}. Stay cautious with any unexpected request for money or codes.`;
}

function coverageLevel(input: BuildAnalysisInput): EvidenceCoverage {
  const triggered = input.findings.filter((finding) => finding.weight > 0).length;
  const providers = input.providersUsed.length;
  const level = providers >= 2 || (providers >= 1 && triggered >= 3) ? 'high' : providers >= 1 || triggered >= 2 ? 'medium' : 'low';
  const explanation =
    providers >= 1
      ? `${triggered} of ${input.signalsEvaluated} signals triggered. External sources consulted: ${input.providersUsed.join(', ')}.`
      : `${triggered} of ${input.signalsEvaluated} signals triggered using built-in rules only. No external reputation source was available for this scan.`;
  return {
    level,
    signalsEvaluated: input.signalsEvaluated,
    signalsTriggered: triggered,
    providersUsed: input.providersUsed,
    providersUnavailable: input.providersUnavailable,
    explanation,
  };
}

function maxSeverity(findings: RawFinding[]): FindingSeverity {
  let result: FindingSeverity = 'info';
  for (const finding of findings) {
    if (SEVERITY_ORDER.indexOf(finding.severity) > SEVERITY_ORDER.indexOf(result)) result = finding.severity;
  }
  return result;
}

export function buildAnalysis(input: BuildAnalysisInput): ScanAnalysis {
  const { score, contributions } = aggregateScore(input.findings);
  const findings = input.findings
    .map((finding, index) => toFinding(finding, contributions.get(finding) ?? 0, index))
    .sort((a, b) => b.scoreImpact - a.scoreImpact);

  const category = pickPrimaryCategory(input.categoryVotes, input.fallbackCategory ?? 'unknown');
  const limitations = new Set(input.limitations);
  limitations.add(SCORE_DISCLAIMER);
  if (input.providersUnavailable.length > 0) {
    limitations.add(
      `These sources were unavailable and their silence is not evidence of safety: ${input.providersUnavailable.join(', ')}.`,
    );
  }
  if (input.findings.length === 0) {
    limitations.add('No automated check can prove that a message, link or sender is safe.');
  }

  return {
    riskScore: score,
    riskLevel: riskLevelFromScore(score),
    primaryCategory: category,
    summary: summarize(score, category, findings),
    findings,
    extracted: input.extracted,
    evidenceCoverage: coverageLevel(input),
    modelConfidence: input.modelConfidence ?? null,
    engine: {
      rulesVersion: RULES_VERSION,
      scorerVersion: SCORER_VERSION,
      nlpModel: input.nlpModel ?? null,
      aiExplanation: input.aiExplanation ?? false,
    },
    limitations: [...limitations],
  };
}

export function highestSeverity(findings: RawFinding[]): FindingSeverity {
  return maxSeverity(findings);
}
