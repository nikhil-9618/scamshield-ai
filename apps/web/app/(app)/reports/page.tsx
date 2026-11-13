import type { Metadata } from 'next';
import Link from 'next/link';
import type { CommunityReportDto, Paginated } from '@scamshield/shared-types';
import { CATEGORY_LABELS } from '@scamshield/shared-types';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@/components/ui/primitives';
import { ReportForm } from '@/components/scamshield/report-form';
import { formatDateTime, truncate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Community reports' };

const STATUS_VARIANT = {
  pending: 'warning',
  verified: 'success',
  rejected: 'danger',
  duplicate: 'outline',
} as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser('/reports');
  const params = await searchParams;
  const result = await apiFetch<Paginated<CommunityReportDto>>('/reports/mine?page=1&pageSize=20');
  const defaultTarget = typeof params.target === 'string' ? params.target : '';
  const defaultTargetType = typeof params.targetType === 'string' ? params.targetType : 'domain';

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Community intelligence</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Report a scam</h1>
        <p className="max-w-2xl text-sm text-muted">
          Reports help other users and feed the moderated threat registry. Every report is reviewed before it can affect a
          scan result.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Submit a report</CardTitle>
            <CardDescription>Be specific. Never include your own OTPs, passwords or full card numbers.</CardDescription>
          </CardHeader>
          <CardContent>
            <ReportForm defaultTarget={defaultTarget} defaultTargetType={defaultTargetType} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Your reports</CardTitle>
              <CardDescription>Moderation status is updated in-app and by email when configured.</CardDescription>
            </CardHeader>
            <CardContent>
              {!result.ok ? (
                <Alert variant="danger" title="Reports could not be loaded">
                  {result.error.message}
                </Alert>
              ) : result.data.items.length === 0 ? (
                <EmptyState
                  title="No reports yet"
                  description="When you submit a report, its moderation status will appear here."
                />
              ) : (
                <ul className="divide-y divide-line/70">
                  {result.data.items.map((report) => (
                    <li key={report.id} className="space-y-1 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-xs text-ink">{report.target}</p>
                        <Badge variant={STATUS_VARIANT[report.status] ?? 'outline'}>{report.status}</Badge>
                      </div>
                      <p className="text-xs text-muted">
                        {CATEGORY_LABELS[report.category] ?? report.category} · reported {formatDateTime(report.createdAt)}
                      </p>
                      <p className="text-xs text-muted">{truncate(report.description, 180)}</p>
                      {report.verificationCount > 0 ? (
                        <p className="text-[11px] text-accent">
                          {report.verificationCount} corroborating report{report.verificationCount === 1 ? '' : 's'} linked
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How moderation works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted">
              <p>1. Your report is stored as <span className="text-ink">pending</span>; duplicates are linked, not silently merged.</p>
              <p>2. A moderator reviews the evidence and may verify, reject or mark it as a duplicate.</p>
              <p>3. Only verified reports can be promoted into the threat registry, with the moderator recorded.</p>
              <p>
                See the{' '}
                <Link href="/threats" className="text-accent hover:underline">
                  verified threat registry
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
