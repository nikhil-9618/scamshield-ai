import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ScanLine } from 'lucide-react';
import type { Paginated, ScanRecord } from '@scamshield/shared-types';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { Alert, Badge, Button, Card, CardContent, EmptyState, RiskBadge } from '@/components/ui/primitives';
import { ClearHistoryButton, DeleteScanButton } from '@/components/scamshield/history-actions';
import { formatDateTime, SCAN_TYPE_LABELS, truncate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Scan history' };

const TYPES = [
  { value: '', label: 'All types' },
  { value: 'message', label: 'Message' },
  { value: 'url', label: 'URL' },
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'qr', label: 'QR code' },
  { value: 'email', label: 'Email' },
];

const RISKS = [
  { value: '', label: 'All risk levels' },
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export default async function ScansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser('/scans');
  const params = await searchParams;
  const page = Math.max(1, Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1);
  const type = typeof params.type === 'string' ? params.type : '';
  const riskLevel = typeof params.riskLevel === 'string' ? params.riskLevel : '';

  const query = new URLSearchParams({ page: String(page), pageSize: '15' });
  if (type) query.set('type', type);
  if (riskLevel) query.set('riskLevel', riskLevel);

  const result = await apiFetch<Paginated<ScanRecord>>(`/scans?${query.toString()}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-accent">History</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Scan history</h1>
          <p className="text-sm text-muted">Full reports remain available until you delete them.</p>
        </div>
        <div className="flex items-center gap-2">
          <ClearHistoryButton />
          <Button asChild size="sm">
            <Link href="/scan">New scan</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-xs text-muted">
              <span className="block">Type</span>
              <select
                name="type"
                defaultValue={type}
                className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
              >
                {TYPES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted">
              <span className="block">Risk level</span>
              <select
                name="riskLevel"
                defaultValue={riskLevel}
                className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
              >
                {RISKS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline" size="sm">
              Apply filters
            </Button>
            {type || riskLevel ? (
              <Link href="/scans" className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
                Reset
              </Link>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {!result.ok ? (
        <Alert variant="danger" title="History could not be loaded">
          {result.error.message}
        </Alert>
      ) : result.data.items.length === 0 ? (
        <EmptyState
          icon={<ScanLine className="h-5 w-5" />}
          title={type || riskLevel ? 'No scans match those filters' : 'No scans yet'}
          description={
            type || riskLevel
              ? 'Try a different type or risk level, or clear the filters.'
              : 'Your scan results will appear here with their findings and risk scores.'
          }
          action={
            <Button asChild size="sm">
              <Link href="/scan">Open the scanner</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto pt-5">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Your scan history</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                  <th scope="col" className="pb-2 pr-3 font-medium">Scan</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Type</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Risk</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Date</th>
                  <th scope="col" className="pb-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {result.data.items.map((scan) => (
                  <tr key={scan.id} className="align-top">
                    <td className="max-w-[320px] py-3 pr-3">
                      <Link href={`/scans/${scan.id}`} className="block font-medium text-ink hover:text-accent">
                        {truncate(scan.inputPreview ?? scan.summary, 100) || 'Scan'}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">{scan.summary}</p>
                      {scan.hasStoredContent ? (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          Content stored with consent
                        </Badge>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 text-muted">{SCAN_TYPE_LABELS[scan.type] ?? scan.type}</td>
                    <td className="py-3 pr-3">
                      <RiskBadge level={scan.riskLevel} score={scan.riskScore} />
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 text-xs text-muted">{formatDateTime(scan.createdAt)}</td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/scans/${scan.id}`}>View</Link>
                        </Button>
                        <DeleteScanButton scanId={scan.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between pt-4 text-xs text-muted">
              <span>
                Page {result.data.page} of {result.data.totalPages} · {result.data.total} scan
                {result.data.total === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={{
                        pathname: '/scans',
                        query: { ...(type ? { type } : {}), ...(riskLevel ? { riskLevel } : {}), page: page - 1 },
                      }}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Previous
                    </Link>
                  </Button>
                ) : null}
                {page < result.data.totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={{
                        pathname: '/scans',
                        query: { ...(type ? { type } : {}), ...(riskLevel ? { riskLevel } : {}), page: page + 1 },
                      }}
                    >
                      Next <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
