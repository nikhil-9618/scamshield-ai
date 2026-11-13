'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { clearHistoryAction, deleteScanAction } from '@/lib/actions';

export function DeleteScanButton({ scanId }: { scanId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      aria-label="Delete scan"
      onClick={() => {
        if (!window.confirm('Delete this scan and its findings? This cannot be undone.')) return;
        startTransition(async () => {
          const result = await deleteScanAction(scanId);
          if (result.ok) {
            toast.success('Scan deleted');
            router.refresh();
          } else {
            toast.error(result.message ?? 'Could not delete the scan');
          }
        });
      }}
    >
      {!pending ? <Trash2 className="h-3.5 w-3.5" aria-hidden /> : null}
    </Button>
  );
}

export function ClearHistoryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() => {
        if (!window.confirm('Delete your entire scan history and all stored findings? This cannot be undone.')) return;
        startTransition(async () => {
          const result = await clearHistoryAction();
          if (result.ok) {
            toast.success(result.message ?? 'History cleared');
            router.refresh();
          } else {
            toast.error(result.message ?? 'Could not clear history');
          }
        });
      }}
    >
      Clear history
    </Button>
  );
}

export function DeleteScanInline({ scanId }: { scanId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="danger"
      size="sm"
      loading={pending}
      onClick={() => {
        if (!window.confirm('Delete this scan permanently?')) return;
        startTransition(async () => {
          const result = await deleteScanAction(scanId);
          if (result.ok) {
            toast.success('Scan deleted');
            router.push('/scans');
          } else {
            toast.error(result.message ?? 'Could not delete the scan');
          }
        });
      }}
    >
      Delete scan
    </Button>
  );
}

export function useActionPending() {
  const [pending, startTransition] = useTransition();
  return { pending, startTransition };
}
