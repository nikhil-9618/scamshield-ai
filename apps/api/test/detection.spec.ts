import type { ExtractedEntities } from '@scamshield/shared-types';
import { analyzeText } from '../src/scans/detectors/text-rules';
import { aggregateScore, buildAnalysis, pickPrimaryCategory } from '../src/scans/detectors/scoring';
import type { CategoryVotes, RawFinding } from '../src/scans/detectors/types';

const EMPTY_ENTITIES: ExtractedEntities = { urls: [], domains: [], phoneNumbers: [], emailAddresses: [], upiIds: [] };

function finding(weight: number, source: RawFinding['source'] = 'scamshield_rules'): RawFinding {
  return {
    key: `f-${weight}-${source}`,
    title: 'Signal',
    severity: 'medium',
    weight,
    evidence: 'Evidence',
    method: 'rule',
    source,
    recommendedAction: 'Verify independently.',
    observedAt: new Date().toISOString(),
  };
}

function analyze(text: string, votes: CategoryVotes = {}, fallbackCategory: RawFinding['category'] = 'unknown') {
  const output = analyzeText(text);
  return buildAnalysis({
    findings: output.findings,
    extracted: output.entities,
    categoryVotes: { ...output.categoryVotes, ...votes },
    signalsEvaluated: output.signalsEvaluated,
    providersUsed: [],
    providersUnavailable: [],
    limitations: output.limitations,
    fallbackCategory,
  });
}

describe('deterministic message rules', () => {
  it('detects an upfront-fee job scam with explicit evidence', () => {
    const result = analyzeText(
      'Congratulations! You are selected for a work from home data entry internship. Earn Rs 3500 daily. Pay a refundable registration fee of Rs 499 to confirm your seat. Contact HR on Telegram.',
    );
    const keys = result.findings.map((item) => item.key);
    expect(keys).toContain('upfront_payment_request');
    expect(keys).toContain('fake_job_offer');
    const payment = result.findings.find((item) => item.key === 'upfront_payment_request');
    expect(payment?.evidence).toContain('registration fee');
    expect(payment?.recommendedAction.length).toBeGreaterThan(10);
    expect(result.categoryVotes.fake_job).toBeGreaterThan(0);
  });

  it('does not flag a genuine OTP notification as a credential request', () => {
    const result = analyzeText(
      'Your OTP for login is 483920. Do not share it with anyone. It is valid for 10 minutes. We never ask for your OTP.',
    );
    expect(result.findings.map((item) => item.key)).not.toContain('credential_request');
  });

  it('detects an explicit request to share an OTP', () => {
    const result = analyzeText('Dear customer, to unblock your card share the OTP with our executive immediately.');
    const credential = result.findings.find((item) => item.key === 'credential_request');
    expect(credential).toBeDefined();
    expect(credential?.severity).toBe('critical');
  });

  it('flags remote-access tools as critical', () => {
    const result = analyzeText('Microsoft support here. Install AnyDesk and allow remote access so we can fix your PC.');
    expect(result.findings.some((item) => item.key === 'remote_access_request')).toBe(true);
  });

  it('produces a low score for routine transactional text but never claims safety', () => {
    const analysis = analyze('Your order has been shipped and will be delivered tomorrow between 4 and 7 pm.');
    expect(analysis.riskScore).toBeLessThan(25);
    expect(analysis.riskLevel).toBe('low');
    expect(analysis.summary).toMatch(/not a guarantee of safety/i);
    expect(analysis.limitations.join(' ')).toMatch(/not a validated probability/i);
  });

  it('scores a clear scam as high or critical and exposes per-finding impact', () => {
    const analysis = analyze(
      'URGENT: your SBI account will be blocked today. Complete KYC at http://sbi-kyc-verify.top and send the OTP to our executive immediately.',
    );
    expect(analysis.riskScore).toBeGreaterThanOrEqual(50);
    expect(['high', 'critical']).toContain(analysis.riskLevel);
    expect(analysis.findings.every((item) => typeof item.scoreImpact === 'number')).toBe(true);
    expect(analysis.findings.length).toBeGreaterThan(0);
  });
});

describe('transparent scoring', () => {
  it('applies diminishing returns to additional signals', () => {
    const { score } = aggregateScore([finding(20), finding(20), finding(20)]);
    expect(score).toBe(51);
    expect(score).toBeLessThan(60);
  });

  it('caps the score at 100', () => {
    expect(aggregateScore([finding(60), finding(60), finding(60)]).score).toBe(100);
  });

  it('adds a small bounded bonus for independent corroboration', () => {
    const twoSources = aggregateScore([finding(20, 'scamshield_rules'), finding(20, 'email_headers')]).score;
    const threeSources = aggregateScore([
      finding(20, 'scamshield_rules'),
      finding(20, 'email_headers'),
      finding(20, 'google_safe_browsing'),
    ]).score;
    expect(threeSources).toBeGreaterThan(twoSources);
  });

  it('maps product thresholds deterministically', () => {
    const level = (score: number) =>
      buildAnalysis({
        findings: score > 0 ? [finding(score)] : [],
        extracted: EMPTY_ENTITIES,
        categoryVotes: {},
        signalsEvaluated: 1,
        providersUsed: [],
        providersUnavailable: [],
        limitations: [],
        fallbackCategory: 'unknown',
      }).riskLevel;
    expect(level(0)).toBe('low');
    expect(level(25)).toBe('moderate');
    expect(level(50)).toBe('high');
    expect(level(75)).toBe('critical');
  });

  it('picks the category with the strongest votes', () => {
    expect(pickPrimaryCategory({ phishing: 10, fake_job: 30 }, 'unknown')).toBe('fake_job');
    expect(pickPrimaryCategory({}, 'qr_scam')).toBe('qr_scam');
  });

  it('reports unavailable sources as a coverage limitation', () => {
    const analysis = buildAnalysis({
      findings: [finding(30)],
      extracted: EMPTY_ENTITIES,
      categoryVotes: { phishing: 30 },
      signalsEvaluated: 5,
      providersUsed: [],
      providersUnavailable: ['VirusTotal'],
      limitations: [],
      fallbackCategory: 'phishing',
    });
    expect(analysis.evidenceCoverage.level).toBe('low');
    expect(analysis.limitations.join(' ')).toMatch(/VirusTotal/);
    expect(analysis.limitations.join(' ')).toMatch(/silence is not evidence of safety/i);
    expect(analysis.modelConfidence).toBeNull();
  });
});
