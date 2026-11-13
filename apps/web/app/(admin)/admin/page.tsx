import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, ArrowRight, DatabaseZap, Flag, ShieldAlert, Users } from 'lucide-react';
import type { AdminAnalytics } from '@scamshield/shared-types';
import { apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, StatCard } from '@/components/ui/primitives';
import { TrendChart } from '@/components/scamshield/dashboard-charts';

export default async function AdminOverviewPage() {
  const session = await requireAdmin('/admin');
  if (!session.user.roles.includes('admin')) redirect('/admin/reports');
  const result = await apiFetch<AdminAnalytics>('/admin/analytics');

  if (!result.ok) {
    return (
      <Alert variant="danger" title="Analytics could not be loaded">
        {result.error.message}
      </Alert>
    );
  }
  const data = result.data;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Platform overview</p>
        <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
        <p className="text-sm text-muted">Aggregates come directly from the database. Counters since this API instance started.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Users" value={data.users.total} hint={`${data.users.newLast7Days} new in 7 days · ${data.users.admins} admins`} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Scans" value={data.scans.total} hint={`${data.scans.failed} failed · ${data.scans.last7Days} in 7 days`} icon={<DatabaseZap className="h-4 w-4" />} />
        <StatCard label="Pending reports" value={data.reports.pending} hint={`${data.reports.verified} verified · ${data.reports.duplicate} duplicates`} icon={<Flag className="h-4 w-4" />} accent="text-warning" />
        <StatCard label="Failed sign-ins (24h)" value={data.abuse.failedLogins24h} hint={`${data.abuse.lockedAccounts} locked accounts`} icon={<ShieldAlert className="h-4 w-4" />} accent="text-danger" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Scan volume — 14 days</CardTitle>
            <CardDescription>All scans and those rated high or critical</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={data.scans.trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk mix</CardTitle>
            <CardDescription>Completed scans by risk band</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.scans.riskDistribution.map((slice) => (
              <div key={slice.key} className="flex items-center justify-between rounded-lg border border-line bg-white/[0.02] px-3 py-2 text-xs">
                <span className="text-muted">{slice.label}</span>
                <span className="font-mono text-ink">{slice.count}</span>
              </div>
            ))}
            <div className="pt-2 text-xs text-muted">
              Scan types:{' '}
              {data.scans.byType
                .filter((entry) => entry.count > 0)
                .map((entry) => `${entry.label} ${entry.count}`)
                .join(' · ') || 'none yet'}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Provider health</CardTitle>
              <CardDescription>Threat intelligence and AI services</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/health">Details</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.providers.map((provider) => (
              <div key={provider.name} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white/[0.02] px-3 py-2 text-xs">
                <div>
                  <p className="text-ink">{provider.name}</p>
                  <p className="text-muted">{provider.message}</p>
                </div>
                <Badge variant={provider.status === 'healthy' ? 'success' : provider.status === 'degraded' ? 'warning' : 'outline'}>
                  {provider.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operational attention</CardTitle>
            <CardDescription>Items that usually need a human decision</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { label: `${data.reports.pending} reports waiting for moderation`, href: '/admin/reports', icon: Flag },
              { label: `${data.feedback.incorrect} users flagged a result as wrong`, href: '/admin/reports', icon: AlertTriangle },
              { label: `${data.threatDomains.verified} verified threat domains`, href: '/admin/threats', icon: ShieldAlert },
              { label: `${data.abuse.rateLimitedRequests} requests throttled since boot`, href: '/admin/health', icon: ShieldAlert },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white/[0.02] px-3 py-2 text-xs text-muted hover:text-ink"
              >
                <span className="flex items-center gap-2">
                  <item.icon className="h-3.5 w-3.5 text-accent" aria-hidden /> {item.label}
                </span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
