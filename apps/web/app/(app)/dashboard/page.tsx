import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  FileSearch,
  Link2,
  Mail,
  MessageSquare,
  QrCode,
  Radar,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import type { DashboardAnalytics } from '@scamshield/shared-types';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
  RiskBadge,
  StatCard,
} from '@/components/ui/primitives';
import { CategoryBars, RiskDonut, TrendChart } from '@/components/scamshield/dashboard-charts';
import { formatDateTime, relativeTime, SCAN_TYPE_LABELS } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };

const QUICK_SCANS = [
  { href: '/scan?type=message', label: 'Message', icon: MessageSquare },
  { href: '/scan?type=url', label: 'Link', icon: Link2 },
  { href: '/scan?type=screenshot', label: 'Screenshot', icon: FileSearch },
  { href: '/scan?type=qr', label: 'QR code', icon: QrCode },
  { href: '/scan?type=email', label: 'Email', icon: Mail },
];

export default async function DashboardPage() {
  const session = await requireUser();
  const result = await apiFetch<DashboardAnalytics>('/dashboard/analytics');

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Alert variant="danger" title="Analytics could not be loaded">
          <p>{result.error.message}</p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/dashboard">Retry</Link>
          </Button>
        </Alert>
      </div>
    );
  }

  const data = result.data;
  const quotaPercent = data.quotas.dailyScanLimit > 0 ? (data.quotas.scansUsedToday / data.quotas.dailyScanLimit) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-accent">Security overview</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Welcome back, {session.user.displayName.split(' ')[0]}
          </h1>
          <p className="text-sm text-muted">Every number here is calculated from your own scan records.</p>
        </div>
        <Button asChild>
          <Link href="/scan">
            <ScanLine className="h-4 w-4" aria-hidden /> New scan
          </Link>
        </Button>
      </div>

      {!data.totalScans ? (
        <Card className="border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card">
          <CardContent className="flex flex-col items-start justify-between gap-5 pt-6 md:flex-row md:items-center">
            <div className="max-w-xl space-y-2">
              <Badge variant="primary">Start here</Badge>
              <h2 className="text-xl font-semibold">Check the next thing that feels off</h2>
              <p className="text-sm text-muted">
                Paste a message, link or email, or upload a screenshot or QR code. You will see the evidence behind every
                finding, not just a label.
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/scan">
                Open the scanner <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total scans" value={data.totalScans} hint={`${data.scansLast7Days} in the last 7 days`} icon={<Radar className="h-4 w-4" />} />
        <StatCard label="Suspicious" value={data.suspiciousScans} hint="Score 25 or higher" icon={<AlertTriangle className="h-4 w-4" />} accent="text-warning" />
        <StatCard label="High risk" value={data.highRiskScans} hint="Score 50 or higher" icon={<ShieldAlert className="h-4 w-4" />} accent="text-danger" />
        <StatCard label="Critical" value={data.criticalScans} hint="Score 75 or higher" icon={<ShieldAlert className="h-4 w-4" />} accent="text-danger" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink">Daily scan allowance</p>
            <p className="text-xs text-muted">
              {data.quotas.scansUsedToday} of {data.quotas.dailyScanLimit} scans used in the last 24 hours ·{' '}
              {session.user.plan?.name ?? 'Guardian Free'}
            </p>
          </div>
          <div className="w-full sm:w-64">
            <Progress value={quotaPercent} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>14-day scan activity</CardTitle>
              <CardDescription>Scans and high/critical results per day</CardDescription>
            </div>
            <TrendingUp className="h-4 w-4 text-muted" aria-hidden />
          </CardHeader>
          <CardContent>
            <TrendChart data={data.trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Risk distribution</CardTitle>
            <CardDescription>Completed scans by risk band</CardDescription>
          </CardHeader>
          <CardContent>
            <RiskDonut data={data.riskDistribution} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>Scam categories</CardTitle>
            <CardDescription>Primary category of completed scans</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBars data={data.categoryDistribution} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent scans</CardTitle>
              <CardDescription>Your latest analysis results</CardDescription>
            </div>
            {data.totalScans > 0 ? (
              <Link href="/scans" className="text-xs text-accent hover:underline">
                View all
              </Link>
            ) : null}
          </CardHeader>
          <CardContent>
            {data.recentScans.length === 0 ? (
              <EmptyState
                icon={<ScanLine className="h-5 w-5" />}
                title="No scans yet"
                description="Start with the message or link you are unsure about. Results stay private to your account."
                action={
                  <Button asChild size="sm">
                    <Link href="/scan">Scan something</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-line/70">
                {data.recentScans.map((scan) => (
                  <li key={scan.id}>
                    <Link href={`/scans/${scan.id}`} className="flex items-start justify-between gap-3 py-3 transition-colors hover:bg-white/[0.02]">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md border border-line bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                            {SCAN_TYPE_LABELS[scan.type] ?? scan.type}
                          </span>
                          <span className="text-xs text-muted">{relativeTime(scan.createdAt)}</span>
                        </div>
                        <p className="truncate text-sm text-ink/90">{scan.summary || 'Scan in progress…'}</p>
                      </div>
                      <RiskBadge level={scan.riskLevel} score={scan.riskScore} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent alerts</CardTitle>
              <CardDescription>Notifications from your scans and reports</CardDescription>
            </div>
            <Link href="/notifications" className="text-xs text-accent hover:underline">
              All notifications
            </Link>
          </CardHeader>
          <CardContent>
            {data.recentAlerts.length === 0 ? (
              <EmptyState
                icon={<BellRing className="h-5 w-5" />}
                title="No unread alerts"
                description="High-risk scans and moderation updates appear here. Email alerts are optional."
              />
            ) : (
              <ul className="space-y-2">
                {data.recentAlerts.map((alert) => (
                  <li key={alert.id} className="rounded-xl border border-line bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{alert.title}</p>
                      <span className="text-[11px] text-muted">{relativeTime(alert.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{alert.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick scan shortcuts</CardTitle>
            <CardDescription>Jump straight to the scanner you need</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {QUICK_SCANS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.02] px-3 py-3 text-sm text-muted transition-colors hover:border-primary/30 hover:text-ink"
              >
                <Icon className="h-4 w-4 text-accent" aria-hidden />
                {label}
              </Link>
            ))}
            <Link
              href="/reports"
              className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.02] px-3 py-3 text-sm text-muted transition-colors hover:border-primary/30 hover:text-ink"
            >
              <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
              Report a scam
            </Link>
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] leading-relaxed text-muted/70">
        Risk bands: 0–24 low, 25–49 moderate, 50–74 high, 75–100 critical. These are provisional product thresholds, not
        validated probabilities of fraud. Average score across your scans:{' '}
        <span className="font-mono text-muted">{data.averageRiskScore}</span>. Last calculated {formatDateTime(new Date())}.
      </p>
    </div>
  );
}
