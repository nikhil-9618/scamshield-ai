import { redirect } from 'next/navigation';
import type { Paginated, ThreatDomainDto } from '@scamshield/shared-types';
import { CATEGORY_LABELS } from '@scamshield/shared-types';
import { apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, RiskBadge } from '@/components/ui/primitives';
import { ThreatCreateForm } from '@/components/admin/admin-actions';
import { formatDate } from '@/lib/utils';

export default async function AdminThreatsPage() {
  const session = await requireAdmin('/admin/threats');
  if (!session.user.roles.includes('admin')) redirect('/admin/reports');
  const result = await apiFetch<Paginated<ThreatDomainDto>>('/admin/threats?page=1&pageSize=100');

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Intelligence</p>
        <h1 className="text-2xl font-semibold tracking-tight">Threat registry</h1>
        <p className="max-w-3xl text-sm text-muted">
          Verified malicious domains used by scan scoring. Additions are audited and immediately available to link checks.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>Add a verified domain</CardTitle>
            <CardDescription>For confirmed phishing or fraud infrastructure.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThreatCreateForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registry entries</CardTitle>
            <CardDescription>Newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {!result.ok ? (
              <Alert variant="danger" title="Registry could not be loaded">
                {result.error.message}
              </Alert>
            ) : (
              <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {result.data.items.map((domain) => (
                  <div key={domain.id} className="rounded-lg border border-line bg-white/[0.02] px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-xs text-ink">{domain.domain}</p>
                      <div className="flex items-center gap-1.5">
                        {domain.verified ? <Badge variant="success">verified</Badge> : <Badge variant="warning">unverified</Badge>}
                        <RiskBadge level={domain.riskLevel} />
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {CATEGORY_LABELS[domain.category] ?? domain.category} · {domain.reportCount} reports · first seen{' '}
                      {formatDate(domain.firstSeenAt)} · sources: {domain.sources.join(', ') || 'moderator'}
                    </p>
                  </div>
                ))}
                {result.data.items.length === 0 ? <p className="text-sm text-muted">No domains in the registry yet.</p> : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
