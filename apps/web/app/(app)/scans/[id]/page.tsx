import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileWarning,
  Fingerprint,
  Flag,
  Link2,
  Mail,
  MessageSquare,
  QrCode,
  Ruler,
  ShieldQuestion,
  Sparkles,
} from 'lucide-react';
import type { ScanDetail } from '@scamshield/shared-types';
import { CATEGORY_LABELS, RISK_LEVEL_LABELS } from '@scamshield/shared-types';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  RiskBadge,
  ScoreGauge,
  Separator,
  SeverityBadge,
} from '@/components/ui/primitives';
import { DeleteScanInline } from '@/components/scamshield/history-actions';
import { AiExplanationPanel, AutoRefresh, DecodedValue, FeedbackPanel } from '@/components/scamshield/result-actions';
import { formatDateTime, SCAN_TYPE_LABELS } from '@/lib/utils';

export const metadata: Metadata = { title: 'Scan result' };

const METHOD_LABELS: Record<string, string> = {
  rule: 'Deterministic rule',
  heuristic: 'Heuristic',
  nlp_model: 'Statistical model',
  threat_intel: 'Threat intelligence',
  header_analysis: 'Email header analysis',
  ocr: 'OCR extraction',
  metadata: 'Metadata',
};

const SOURCE_LABELS: Record<string, string> = {
  scamshield_rules: 'ScamShield rules',
  scamshield_nlp: 'ScamShield NLP',
  google_safe_browsing: 'Google Safe Browsing',
  virustotal: 'VirusTotal',
  urlhaus: 'URLhaus',
  phishtank: 'PhishTank',
  dns: 'DNS',
  tls: 'TLS certificate',
  email_headers: 'Email headers',
  qr_decoder: 'QR decoder',
  ocr: 'OCR',
  community_reports: 'Community reports',
};

const TYPE_ICONS = {
  message: MessageSquare,
  url: Link2,
  screenshot: FileWarning,
  qr: QrCode,
  email: Mail,
} as const;

export default async function ScanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/scans/${id}`);
  const result = await apiFetch<ScanDetail>(`/scans/${id}`);

  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <div className="space-y-4">
        <Link href="/scans" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to history
        </Link>
        <Alert variant="danger" title="Result could not be loaded">
          {result.error.message}
        </Alert>
      </div>
    );
  }

  const scan = result.data;
  const analysis = scan.analysis;
  const Icon = TYPE_ICONS[scan.type] ?? FileWarning;
  const reportTarget = analysis?.extracted.domains[0] ?? '';
  const reportHref = `/reports${reportTarget ? `?targetType=domain&target=${encodeURIComponent(reportTarget)}` : ''}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <Link href="/scans" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to history
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={reportHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted hover:text-ink"
          >
            <Flag className="h-3.5 w-3.5" aria-hidden /> Report a scam
          </Link>
          <DeleteScanInline scanId={scan.id} />
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Icon className="h-3.5 w-3.5" aria-hidden /> {SCAN_TYPE_LABELS[scan.type] ?? scan.type}
            </Badge>
            <RiskBadge level={scan.riskLevel} score={scan.riskScore} />
            {analysis ? <Badge variant="primary">{CATEGORY_LABELS[analysis.primaryCategory]}</Badge> : null}
          </div>
          <h1 className="max-w-3xl text-balance text-xl font-semibold tracking-tight sm:text-2xl">{scan.summary}</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Clock className="h-3.5 w-3.5" aria-hidden /> {formatDateTime(scan.createdAt)}
          </p>
        </div>
      </div>

      {scan.status === 'processing' || scan.status === 'queued' ? (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <Clock className="h-4 w-4 text-accent" aria-hidden /> This scan is still running
            </p>
            <p className="text-sm text-muted">Results normally arrive within a few seconds. This page will refresh itself.</p>
            <AutoRefresh />
          </CardContent>
        </Card>
      ) : null}

      {scan.status === 'failed' ? (
        <Alert variant="danger" title="This scan could not be completed">
          <p>{scan.errorMessage ?? 'The analysis failed before a result could be produced.'}</p>
          <p className="mt-2 text-xs">
            No result is better than a made-up one. Check the input and try again, or use a different scan type.
          </p>
        </Alert>
      ) : null}

      {analysis ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <Card>
              <CardContent className="flex flex-col gap-6 pt-6 sm:flex-row sm:items-center">
                <ScoreGauge score={analysis.riskScore} level={analysis.riskLevel} />
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Risk assessment</p>
                  <p className="text-lg font-semibold text-ink">{RISK_LEVEL_LABELS[analysis.riskLevel]}</p>
                  <p className="text-sm leading-relaxed text-muted">{analysis.summary}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant="outline">{analysis.findings.length} findings</Badge>
                    <Badge variant="outline">
                      Coverage: {analysis.evidenceCoverage.level}
                    </Badge>
                    {analysis.modelConfidence ? (
                      <Badge variant="outline">
                        Model signal: {analysis.modelConfidence.label} (uncalibrated)
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>

            {scan.type === 'qr' && scan.decodedValue ? (
              <Card className="border-warning/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-warning" aria-hidden /> Decoded QR destination
                  </CardTitle>
                  <CardDescription>
                    Shown for inspection only. ScamShield never opens this automatically.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <DecodedValue value={scan.decodedValue} />
                  <p className="text-[11px] leading-relaxed text-muted/80">
                    Do not open this address unless you independently trust it. QR codes can authorise payments without any
                    further confirmation.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ruler className="h-4 w-4 text-accent" aria-hidden /> Evidence coverage
                  </CardTitle>
                  <CardDescription>What was actually checked for this scan.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-xs text-muted">
                  <p>{analysis.evidenceCoverage.explanation}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-line bg-white/[0.02] p-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted">Signals evaluated</p>
                      <p className="font-mono text-sm text-ink">{analysis.evidenceCoverage.signalsEvaluated}</p>
                    </div>
                    <div className="rounded-lg border border-line bg-white/[0.02] p-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted">Signals triggered</p>
                      <p className="font-mono text-sm text-ink">{analysis.evidenceCoverage.signalsTriggered}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted">Sources used</p>
                    <p className="text-ink/90">
                      {analysis.evidenceCoverage.providersUsed.length > 0
                        ? analysis.evidenceCoverage.providersUsed.join(', ')
                        : 'Built-in rules only'}
                    </p>
                  </div>
                  {analysis.evidenceCoverage.providersUnavailable.length > 0 ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted">Unavailable</p>
                      <p className="text-warning">{analysis.evidenceCoverage.providersUnavailable.join(', ')}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Findings</CardTitle>
              <CardDescription>
                Every finding shows the exact evidence, how it was detected and what to do. Contributions sum (with
                diminishing weight) to the risk score.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.findings.length === 0 ? (
                <div className="rounded-xl border border-line bg-white/[0.02] p-4 text-sm text-muted">
                  No individual finding crossed the reporting threshold. That is not proof of safety — review the
                  limitations and verify anything involving money or credentials.
                </div>
              ) : (
                analysis.findings.map((finding) => (
                  <div key={`${finding.key}-${finding.title}`} className="rounded-xl border border-line bg-white/[0.02] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink">{finding.title}</p>
                        <SeverityBadge severity={finding.severity} />
                      </div>
                      <span className="font-mono text-xs text-muted">+{finding.scoreImpact} pts</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{finding.evidence}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted/80">
                      <span>
                        Method: <span className="text-muted">{METHOD_LABELS[finding.detectionMethod] ?? finding.detectionMethod}</span>
                      </span>
                      <span>
                        Source: <span className="text-muted">{SOURCE_LABELS[finding.source] ?? finding.source}</span>
                      </span>
                      <span>Observed: {formatDateTime(finding.observedAt)}</span>
                    </div>
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-line/70 bg-canvas/40 p-3 text-xs text-muted">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                      <span>
                        <span className="font-medium text-ink">Recommended action: </span>
                        {finding.recommendedAction}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <AiExplanationPanel scanId={scan.id} initial={scan.aiExplanation} riskLevel={analysis.riskLevel} />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-accent" aria-hidden /> Extracted indicators
                </CardTitle>
                <CardDescription>What the scanner recognised inside this submission.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {[
                  ['Domains', analysis.extracted.domains],
                  ['URLs', analysis.extracted.urls],
                  ['UPI IDs', analysis.extracted.upiIds],
                  ['Phone numbers', analysis.extracted.phoneNumbers],
                  ['Email addresses', analysis.extracted.emailAddresses],
                ].map(([label, values]) => {
                  const list = values as string[];
                  return (
                    <div key={label as string}>
                      <p className="text-[10px] uppercase tracking-wider text-muted">{label as string}</p>
                      {list.length === 0 ? (
                        <p className="text-muted/70">None detected</p>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {list.slice(0, 8).map((value) => (
                            <li key={value} className="break-all rounded-md border border-line bg-canvas/40 px-2 py-1 font-mono text-[11px] text-ink/90">
                              {value}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
                <p className="flex items-start gap-1.5 pt-1 text-[11px] text-muted/70">
                  <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Indicators are shown as text only. Nothing here is clickable by design.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> Limitations of this result
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ul className="space-y-2 text-xs text-muted">
                {analysis.limitations.map((limitation) => (
                  <li key={limitation} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden />
                    {limitation}
                  </li>
                ))}
              </ul>
              <Separator className="my-3" />
              <p className="text-[11px] text-muted/70">
                Engine: rules {analysis.engine.rulesVersion} · scorer {analysis.engine.scorerVersion}
                {analysis.engine.nlpModel ? ` · model ${analysis.engine.nlpModel}` : ''} · explanation{' '}
                {analysis.engine.aiExplanation ? 'AI-assisted' : 'rule-based'}.
              </p>
            </CardContent>
          </Card>

          <FeedbackPanel scanId={scan.id} initial={scan.feedback ? { verdict: scan.feedback.verdict, comment: scan.feedback.comment } : null} />
        </>
      ) : null}

      {scan.status === 'completed' && !analysis ? (
        <Alert variant="warning" title="Result data missing">
          The scan finished but its structured result is unavailable. Try running the scan again.
        </Alert>
      ) : null}

      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted/70">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {scan.hasStoredContent
          ? 'Full content is stored with your consent, encrypted at rest, and deleted on your retention schedule.'
          : 'Only a redacted preview and hash were stored for this scan; the full content was discarded after analysis.'}
      </p>
    </div>
  );
}
