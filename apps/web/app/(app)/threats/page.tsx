import type { Metadata } from 'next';
import Link from 'next/link';
import { Globe2, Search, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { Paginated, ThreatDomainDto } from '@scamshield/shared-types';
import { CATEGORY_LABELS, RISK_LEVEL_LABELS } from '@scamshield/shared-types';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, RiskBadge } from '@/components/ui/primitives';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Threat intelligence' };

interface LookupResult {
  domain: string;
  found: boolean;
  riskLevel: string | null;
  category: string | null;
  sources: string[];
  reportCount: number;
  lastSeenAt: string | null;
  note: string;
}

export default async function ThreatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser('/threats');
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const lookupDomain = typeof params.domain === 'string' ? params.domain.trim() : '';

  const [list, lookup] = await Promise.all([
    apiFetch<Paginated<ThreatDomainDto>>(`/threats?page=1&pageSize=25${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    lookupDomain ? apiFetch<LookupResult>(`/threats/lookup?domain=${encodeURIComponent(lookupDomain)}`) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Threat intelligence</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Verified threat registry</h1>
        <p className="max-w-2xl text-sm text-muted">
          Only domains confirmed by moderators or corroborated by vetted intelligence sources appear here. Community reports
          alone never mark a domain as malicious.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-4 w-4 text-accent" aria-hidden /> Look up a domain
            </CardTitle>
            <CardDescription>Check a specific domain before you visit it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form method="get" className="flex gap-2">
              <input
                name="domain"
                defaultValue={lookupDomain}
                placeholder="example-bank.com"
                className="h-10 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70"
                aria-label="Domain to look up"
              />
              <Button type="submit" variant="outline">
                Look up
              </Button>
            </form>

            {lookup ? (
              !lookup.ok ? (
                <Alert variant="danger" title="Lookup failed">
                  {lookup.error.message}
                </Alert>
              ) : lookup.data.found ? (
                <div className="space-y-2 rounded-xl border border-danger/30 bg-danger/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-sm text-ink">{lookup.data.domain}</p>
                    <RiskBadge level={lookup.data.riskLevel} />
                  </div>
                  <p className="text-xs text-muted">
                    {CATEGORY_LABELS[(lookup.data.category as keyof typeof CATEGORY_LABELS) ?? 'unknown']} ·{' '}
                    {lookup.data.reportCount} linked report{lookup.data.reportCount === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs text-muted">
                    Sources: {lookup.data.sources.length > 0 ? lookup.data.sources.join(', ') : 'Moderator review'} · last seen{' '}
                    {lookup.data.lastSeenAt ? formatDate(lookup.data.lastSeenAt) : 'unknown'}
                  </p>
                </div>
              ) : (
                <Alert variant="success" title="No verified threat record">
                  <p>{lookup.data.note}</p>
                  <p className="mt-1 text-xs">A missing record does not mean the domain is safe. Check the evidence in a scan.</p>
                </Alert>
              )
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-accent" aria-hidden /> Search the registry
            </CardTitle>
            <CardDescription>Search verified domains by name.</CardDescription>
          </CardHeader>
          <CardContent>
            <form method="get" className="flex gap-2">
              <input
                name="q"
                defaultValue={q}
                placeholder="Search domains"
                className="h-10 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70"
                aria-label="Search threat registry"
              />
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5 text-danger" aria-hidden /> Verified malicious
              </span>
              <span className="inline-flex items-center gap-1">
                <ShieldQuestion className="h-3.5 w-3.5 text-warning" aria-hidden /> Under moderation
              </span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden /> Reported but not listed
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {!list.ok ? (
        <Alert variant="danger" title="Registry could not be loaded">
          {list.error.message}
        </Alert>
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={<Globe2 className="h-5 w-5" />}
          title={q ? 'No verified domains match that search' : 'No verified domains yet'}
          description={
            q
              ? 'Try a shorter domain fragment, or run a scan to check a specific link.'
              : 'Verified malicious domains appear here after moderator review. You can still scan any link directly.'
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto pt-5">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Verified threat domains</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                  <th scope="col" className="pb-2 pr-3 font-medium">Domain</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Risk</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Category</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Sources</th>
                  <th scope="col" className="pb-2 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {list.data.items.map((domain) => (
                  <tr key={domain.id}>
                    <td className="py-3 pr-3">
                      <Link href={`/threats?domain=${encodeURIComponent(domain.domain)}`} className="font-mono text-xs text-ink hover:text-accent">
                        {domain.domain}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">
                      <RiskBadge level={domain.riskLevel} />
                    </td>
                    <td className="py-3 pr-3 text-xs text-muted">
                      {CATEGORY_LABELS[domain.category] ?? domain.category}
                    </td>
                    <td className="max-w-[260px] py-3 pr-3 text-xs text-muted">{domain.sources.join(', ') || 'Moderator review'}</td>
                    <td className="whitespace-nowrap py-3 text-xs text-muted">{formatDate(domain.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pt-3 text-[11px] text-muted/70">
              {list.data.total} verified domain{list.data.total === 1 ? '' : 's'} · risk bands are{' '}
              {RISK_LEVEL_LABELS.low.toLowerCase()} to {RISK_LEVEL_LABELS.critical.toLowerCase()}. Presence indicates
              corroborated malicious activity, not a legal determination.
            </p>
          </CardContent>
        </Card>
      )}

      <Alert variant="info" title="Think a domain is missing?">
        <p>
          Submit a community report with evidence.{' '}
          <Link href="/reports" className="text-accent hover:underline">
            Report a scam
          </Link>
          . Moderators verify reports before anything is added here.
        </p>
      </Alert>
    </div>
  );
}
