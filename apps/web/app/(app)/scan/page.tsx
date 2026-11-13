import type { Metadata } from 'next';
import { ScanConsole } from '@/components/scamshield/scan-console';
import { requireUser } from '@/lib/session';
import { apiFetch } from '@/lib/api';

export const metadata: Metadata = { title: 'Scan centre' };

const VALID_TABS = ['message', 'url', 'screenshot', 'qr', 'email'] as const;
type Tab = (typeof VALID_TABS)[number];

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const session = await requireUser('/scan');
  const params = await searchParams;
  const requested = params.type;
  const initialTab: Tab = VALID_TABS.includes(requested as Tab) ? (requested as Tab) : 'message';
  const quota = await apiFetch<{ limit: number; used: number }>('/scans/quota');

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Scan centre</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Check before you trust</h1>
        <p className="max-w-2xl text-sm text-muted">
          Choose the type of content you received. Every result shows the findings, the evidence behind them and what
          remains unknown.
        </p>
      </div>
      <ScanConsole
        initialTab={initialTab}
        defaultConsent={session.user.privacyPreferences.storeScanContent}
        quota={quota.ok ? quota.data : { limit: session.user.plan?.dailyScanLimit ?? 10, used: 0 }}
      />
    </div>
  );
}
