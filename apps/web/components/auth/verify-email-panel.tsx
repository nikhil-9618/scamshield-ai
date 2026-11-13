'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { resendVerificationAction, verifyEmailAction } from '@/lib/actions';

export function VerifyEmailPanel({ token }: { token: string | null }) {
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium text-ink">
          <MailWarning className="h-4 w-4 text-warning" aria-hidden /> Verification link is incomplete
        </p>
        <p className="text-muted">Open the link from your verification email, or request a new one.</p>
        <Button
          variant="outline"
          onClick={async () => {
            const result = await resendVerificationAction();
            setMessage(result.message ?? (result.ok ? 'Verification email sent.' : 'Could not send the email.'));
          }}
        >
          Resend verification email
        </Button>
        {message ? <p className="text-xs text-muted">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {state === 'done' ? (
        <div className="space-y-2 rounded-xl border border-success/25 bg-success/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-ink">
            <BadgeCheck className="h-4 w-4 text-success" aria-hidden /> Email verified
          </p>
          <p className="text-muted">Your account is verified. You can continue to your dashboard.</p>
          <Link href="/dashboard" className="inline-block text-accent hover:underline">
            Go to dashboard
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">Click below to confirm this email address belongs to you.</p>
          <Button
            loading={state === 'pending'}
            onClick={async () => {
              setState('pending');
              const result = await verifyEmailAction(token);
              if (result.ok) {
                setState('done');
              } else {
                setState('error');
                setMessage(result.message ?? 'This verification link is invalid or has expired.');
              }
            }}
          >
            Verify my email
          </Button>
        </>
      )}
      {message ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
