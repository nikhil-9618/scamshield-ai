import {
  AI_EXPLANATION_DISCLAIMER,
  CATEGORY_LABELS,
  RISK_LEVEL_LABELS,
  type AiExplanation,
  type ScanAnalysis,
  type ScanType,
} from '@scamshield/shared-types';

export interface ExplanationRequest {
  scanType: ScanType;
  riskScore: number;
  riskLevel: string;
  category: string;
  summary: string;
  findings: Array<{ title: string; severity: string; evidence: string; recommendedAction: string }>;
  limitations: string[];
  coverage: { level: string; providersUsed: string[]; providersUnavailable: string[] };
}

/**
 * The LLM receives only structured findings — never the raw submitted message,
 * email, screenshot or page. This removes the main prompt-injection channel and
 * keeps the model anchored to evidence the scanner actually observed.
 */
export function buildExplanationRequest(scanType: ScanType, analysis: ScanAnalysis): ExplanationRequest {
  return {
    scanType,
    riskScore: analysis.riskScore,
    riskLevel: analysis.riskLevel,
    category: analysis.primaryCategory,
    summary: analysis.summary,
    findings: analysis.findings.slice(0, 8).map((finding) => ({
      title: finding.title,
      severity: finding.severity,
      evidence: finding.evidence.slice(0, 320),
      recommendedAction: finding.recommendedAction.slice(0, 240),
    })),
    limitations: analysis.limitations.slice(0, 5).map((limitation) => limitation.slice(0, 240)),
    coverage: {
      level: analysis.evidenceCoverage.level,
      providersUsed: analysis.evidenceCoverage.providersUsed,
      providersUnavailable: analysis.evidenceCoverage.providersUnavailable,
    },
  };
}

const CONSEQUENCES: Record<string, string> = {
  fake_job:
    'Fake recruitment scams usually collect an upfront “registration” or “training” fee, and sometimes identity documents that are later misused.',
  phishing:
    'Phishing pages and messages are built to capture passwords, OTPs or card details so the attacker can take over accounts or move money.',
  payment_fraud:
    'Payments made to a fraudster are usually immediate and irreversible, and recovery rates are low.',
  kyc_fraud:
    'Bank KYC scams aim to obtain OTPs, card details or remote access so the attacker can drain accounts.',
  upi_scam:
    'UPI transfers leave your account instantly. A “collect” request or QR code always moves money out, never in.',
  courier_scam:
    'Fake delivery messages charge small “customs” or “redelivery” fees and harvest card details on a look-alike page.',
  fake_support:
    'Fake support agents use remote-access tools to control your device and authorise transfers while you watch.',
  qr_scam:
    'Scanning a fraudulent QR code can authorise a payment to the scammer or open a malicious page.',
  government_scheme:
    'Fake scheme messages collect fees and personal data; genuine benefits are never released for a payment over chat.',
  impersonation:
    'Impersonation succeeds by borrowing trust: the attacker uses a familiar name to get money, codes or documents.',
  investment_fraud:
    'Investment fraud often shows fake profits at first, then blocks withdrawals and requests more “tax” or “fees”.',
  lottery_prize:
    'Prize scams require a “processing fee” or details before a prize that does not exist.',
  unknown:
    'Unverified requests for money, codes or personal information are the most common way people lose money online.',
};

function nextSteps(analysis: ScanAnalysis): string[] {
  const actions = new Set<string>();
  for (const finding of analysis.findings) {
    if (finding.recommendedAction) actions.add(finding.recommendedAction);
    if (actions.size >= 4) break;
  }
  if (actions.size === 0) {
    actions.add('Keep the message and check any organisation through its official website or app before responding.');
  }
  actions.add('If money was already sent, contact your bank immediately and report it to cybercrime.gov.in (India) or your local cybercrime unit.');
  return [...actions].slice(0, 5);
}

/**
 * Deterministic fallback used when the LLM is not configured or fails. It is
 * labelled `template` in the UI — never presented as AI output.
 */
export function templateExplanation(scanType: ScanType, analysis: ScanAnalysis): AiExplanation {
  const heading =
    analysis.riskLevel === 'critical'
      ? 'WARNING: multiple strong scam indicators'
      : analysis.riskLevel === 'high'
        ? 'WARNING: this looks unsafe'
        : analysis.riskLevel === 'moderate'
          ? 'CAUTION: some suspicious elements'
          : 'NO STRONG INDICATORS FOUND';
  const kind = scanType === 'url' ? 'link' : scanType === 'email' ? 'email' : scanType === 'screenshot' ? 'screenshot' : 'message';
  const lines: string[] = [];
  lines.push(`${heading} — risk score ${analysis.riskScore}/100 (${RISK_LEVEL_LABELS[analysis.riskLevel]}).`);
  lines.push('');
  lines.push(`What we checked: this ${kind} was assessed as ${CATEGORY_LABELS[analysis.primaryCategory].toLowerCase()}.`);
  if (analysis.findings.length > 0) {
    lines.push('');
    lines.push('Reasons:');
    analysis.findings.slice(0, 4).forEach((finding, index) => {
      lines.push(`${index + 1}. ${finding.title}. ${finding.evidence}`);
    });
    lines.push('');
    lines.push('Possible consequences:');
    lines.push(CONSEQUENCES[analysis.primaryCategory] ?? CONSEQUENCES.unknown!);
  } else {
    lines.push('');
    lines.push('No individual finding crossed the reporting threshold. Automated checks are limited, so this is not proof of safety.');
  }
  lines.push('');
  lines.push('What to do next:');
  nextSteps(analysis).forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });
  lines.push('');
  lines.push(
    `Uncertainty: ${analysis.evidenceCoverage.signalsTriggered} of ${analysis.evidenceCoverage.signalsEvaluated} checks triggered, using ${analysis.evidenceCoverage.providersUsed.length > 0 ? analysis.evidenceCoverage.providersUsed.join(', ') : 'built-in rules only'}. A risk score is a product heuristic, not a probability of fraud.`,
  );

  const text = lines.join('\n').slice(0, 1800);
  return {
    text,
    generator: 'template',
    model: null,
    generatedAt: new Date().toISOString(),
    disclaimer: AI_EXPLANATION_DISCLAIMER,
  };
}

/** Defensive validation for anything returned by the model. */
export function sanitizeExplanationText(text: string): string | null {
  const cleaned = text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]{1,500}>/g, '')
    .replace(/\u0000/g, '')
    .trim();
  if (cleaned.length < 40 || cleaned.length > 2400) return null;
  if (/ignore (all|any|the) (previous|prior|above) instructions/i.test(cleaned)) return null;
  return cleaned.slice(0, 1800);
}
