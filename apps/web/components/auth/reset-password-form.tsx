'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { passwordIssues } from '@scamshield/validation';
import { Button, FieldError, Input, Label } from '@/components/ui/primitives';
import { resetPasswordAction } from '@/lib/actions';

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  if (success) {
    return (
      <div className="space-y-3 rounded-xl border border-success/25 bg-success/5 p-4 text-sm">
        <p className="font-medium text-ink">Password updated</p>
        <p className="text-muted">All other sessions were signed out. You can now sign in with your new password.</p>
        <Link href="/login" className="inline-block text-accent hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        const issues = passwordIssues(password);
        if (issues.length > 0) {
          setError(issues[0] ?? 'Choose a stronger password.');
          return;
        }
        if (password !== confirm) {
          setError('Passwords do not match.');
          return;
        }
        setPending(true);
        const result = await resetPasswordAction(token, password);
        setPending(false);
        if (!result.ok) {
          setError(result.message ?? 'Could not reset the password.');
          return;
        }
        setSuccess(true);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <p className="text-xs text-muted">At least 12 characters with upper case, lower case and a number.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" className="w-full" loading={pending}>
        <KeyRound className="h-4 w-4" aria-hidden /> {pending ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  );
}
