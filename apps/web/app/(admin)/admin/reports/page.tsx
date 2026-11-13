import Link from 'next/link';
import type { AdminCommunityReportDto, Paginated, ReportStatus } from '@scamshield/shared-types';
import { apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@/components/ui/primitives';
import { ModerationRow } from '@/components/admin/admin-actions';

const FILTERS: Array<{ value: string; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'duplicate', label: 'Duplicates' },
  { value: 'all', label: 'All' },
];

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin('/admin/reports');
  const params = await searchParams;
  const status = typeof params.status === 'string' ? params.status : 'pending';
  const result = await apiFetch<Paginated<AdminCommunityReportDto>>(
    `/admin/reports?status=${encodeURIComponent(status)}&page=1&pageSize=30`,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Trust & safety</p>
        <h1 className="text-2xl font-semibold tracking-tight">Community report moderation</h1>
        <p className="max-w-3xl text-sm text-muted">
          Review the evidence, record your reasoning and decide whether a report is verified. Reports alone never mark
          anything malicious; promotion to the registry is a separate, audited action.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={`/admin/reports?status=${filter.value}`}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              status === filter.value ? 'border-primary/40 bg-primary/10 text-ink' : 'border-line text-muted hover:text-ink'
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reports · {status}</CardTitle>
          <CardDescription>Newest first. Reporter identities are visible to moderators only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!result.ok ? (
            <Alert variant="danger" title="Reports could not be loaded">
              {result.error.message}
            </Alert>
          ) : result.data.items.length === 0 ? (
            <EmptyState
              title="Nothing here"
              description={
                status === 'pending'
                  ? 'The moderation queue is clear. New community reports will appear here.'
                  : `No reports with status “${status}”.`
              }
            />
          ) : (
            result.data.items.map((report) => <ModerationRow key={report.id} report={report} />)
          )}
          {result.ok ? (
            <p className="pt-2 text-[11px] text-muted/70">
              {result.data.total} report{result.data.total === 1 ? '' : 's'} · page {result.data.page} of {result.data.totalPages}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
