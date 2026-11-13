import { redirect } from 'next/navigation';
import { Database, HeartPulse, ListChecks, Server, Sparkles } from 'lucide-react';
import type { SystemHealth } from '@scamshield/shared-types';
import { apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, StatCard } from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/utils';

const STATUS_VARIANT = {
  healthy: 'success',
  degraded: 'warning',
  unavailable: 'danger',
  disabled: 'outline',
} as const;

export default async function AdminHealthPage() {
  const session = await requireAdmin('/admin/health');
  if (!session.user.roles.includes('admin')) redirect('/admin/reports');
  const result = await apiFetch<SystemHealth>('/admin/system-health');

  if (!result.ok) {
    return (
      <Alert variant="danger" title="System health unavailable">
        {result.error.message}
      </Alert>
    );
  }
  const health = result.data;
  const overallVariant = health.status === 'ok' ? 'success' : health.status === 'degraded' ? 'warning' : 'danger';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-accent">Operations</p>
          <h1 className="text-2xl font-semibold tracking-tight">System health</h1>
          <p className="text-sm text-muted">Checked {formatDateTime(health.checkedAt)} · API version {health.version}</p>
        </div>
        <Badge variant={overallVariant} className="text-sm">
          <HeartPulse className="h-4 w-4" aria-hidden /> {health.status}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Database"
          value={health.database.status}
          hint={health.database.message}
          icon={<Database className="h-4 w-4" />}
          accent={health.database.status === 'ok' ? 'text-success' : 'text-danger'}
        />
        <StatCard
          label="Redis / queue driver"
          value={health.redis.status}
          hint={health.redis.message}
          icon={<Server className="h-4 w-4" />}
          accent={health.redis.status === 'error' ? 'text-danger' : 'text-ink'}
        />
        <StatCard
          label="Queue"
          value={health.queue.driver}
          hint={`${health.queue.pending} pending · ${health.queue.failed} failed`}
          icon={<ListChecks className="h-4 w-4" />}
        />
        <StatCard
          label="AI engine"
          value={health.aiEngine.status}
          hint={health.aiEngine.message}
          icon={<Sparkles className="h-4 w-4" />}
          accent={health.aiEngine.status === 'unavailable' ? 'text-warning' : 'text-ink'}
        />
      </div>

      {health.redis.status === 'disabled' ? (
        <Alert variant="warning" title="Running without Redis">
          Scans are executed inline and throttling uses in-process counters. This is functional for a single instance but
          does not survive restarts or horizontal scaling. Configure <code>REDIS_URL</code> for multi-instance production.
        </Alert>
      ) : null}
      {health.aiEngine.status !== 'ok' ? (
        <Alert variant="warning" title="AI engine unavailable">
          Deterministic rules still run and results remain available. NLP classification, OCR, QR decoding and LLM
          explanations degrade gracefully. Screenshot and QR scans may fail with an honest error until the engine is
          reachable.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Intelligence providers</CardTitle>
          <CardDescription>
            Unconfigured providers are skipped, not faked. Cached or unavailable sources are disclosed on each result.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {health.providers.map((provider) => (
            <div key={provider.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white/[0.02] px-3 py-2.5">
              <div className="space-y-0.5">
                <p className="text-sm text-ink">{provider.name}</p>
                <p className="text-xs text-muted">{provider.message}</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted">
                {provider.latencyMs !== null ? <span className="font-mono">{provider.latencyMs} ms</span> : null}
                <Badge variant={STATUS_VARIANT[provider.status] ?? 'outline'}>{provider.status}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted/70">
        Uptime since this API process started. Provider health is probed on demand; a healthy status means the provider
        responded to a lightweight check, not that every query will succeed.
      </p>
    </div>
  );
}
