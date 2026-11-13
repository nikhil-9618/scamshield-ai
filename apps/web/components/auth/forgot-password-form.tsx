'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Button, FieldError, Input, Label } from '@/components/ui/primitives';
import { forgotPasswordAction } from '@/lib/actions';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        setMessage(null);
        const result = await forgotPasswordAction(email);
        setPending(false);
        if (!result.ok) {
          setError(result.message ?? 'Could not send the reset link.');
          return;
        }
        setMessage(result.message ?? 'Check your email for the reset link.');
        setDevToken(result.data?.devToken ?? null);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <FieldError>{error}</FieldError>
      </div>

      {message ? (
        <div className="space-y-2 rounded-lg border border-success/25 bg-success/5 p-3 text-sm text-muted">
          <p>{message}</p>
          {devToken ? (
            <p className="text-xs">
              Development mode (email delivery disabled):{' '}
              <Link href={`/reset-password?token=${encodeURIComponent(devToken)}`} className="text-accent hover:underline">
                open the reset link
              </Link>
              . Production never returns this value.
            </p>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" className="w-full" loading={pending}>
        <Mail className="h-4 w-4" aria-hidden /> {pending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
