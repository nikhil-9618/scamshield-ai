import { redirect } from 'next/navigation';
import type { Paginated } from '@scamshield/shared-types';
import { apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/utils';

interface AuditRow {
  id: string;
  actor: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  ipAddress: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin('/admin/audit');
  if (!session.user.roles.includes('admin')) redirect('/admin/reports');
  const params = await searchParams;
  const action = typeof params.action === 'string' ? params.action.trim() : '';
  const result = await apiFetch<Paginated<AuditRow>>(
    `/admin/audit-logs?page=1&pageSize=100${action ? `&action=${encodeURIComponent(action)}` : ''}`,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Accountability</p>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="max-w-3xl text-sm text-muted">
          Security-relevant actions recorded by the API. Metadata never includes passwords, tokens, scan content or
          decrypted secrets.
        </p>
      </div>

      <form method="get" className="flex max-w-md gap-2">
        <input
          name="action"
          defaultValue={action}
          placeholder="Filter by action, e.g. auth.login"
          className="h-10 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70"
          aria-label="Filter audit log by action"
        />
        <button type="submit" className="rounded-xl border border-line px-3 text-xs text-muted hover:text-ink">
          Filter
        </button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>Newest first, up to 100 per page.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!result.ok ? (
            <Alert variant="danger" title="Audit log could not be loaded">
              {result.error.message}
            </Alert>
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th scope="col" className="pb-2 pr-3 font-medium">When</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Action</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Actor</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Resource</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Outcome</th>
                  <th scope="col" className="pb-2 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {result.data.items.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted">{formatDateTime(row.createdAt)}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-ink">{row.action}</td>
                    <td className="py-2.5 pr-3 text-xs text-muted">
                      {row.actor ?? 'anonymous'}
                      {row.actorRole ? ` (${row.actorRole})` : ''}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-muted">
                      {row.resourceType}
                      {row.resourceId ? ` · ${row.resourceId.slice(0, 8)}…` : ''}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={row.outcome === 'success' ? 'success' : 'danger'}>{row.outcome}</Badge>
                    </td>
                    <td className="py-2.5 font-mono text-xs text-muted">{row.ipAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.ok ? (
            <p className="pt-3 text-[11px] text-muted/70">
              {result.data.total} events · page {result.data.page} of {result.data.totalPages}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
