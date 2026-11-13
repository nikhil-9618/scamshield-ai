'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { emailSchema } from '@scamshield/validation';
import { KeyRound, LogIn } from 'lucide-react';
import { Button, FieldError, Input, Label } from '@/components/ui/primitives';
import { loginAction } from '@/lib/actions';

const formSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
  mfaCode: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export function LoginForm({ next }: { next?: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [showMfa, setShowMfa] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { email: '', password: '', mfaCode: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const code = values.mfaCode?.trim();
    if (code && !/^\d{6}$/.test(code)) {
      setError('mfaCode', { message: 'Enter the 6-digit code' });
      return;
    }
    const result = await loginAction({
      email: values.email,
      password: values.password,
      ...(code ? { mfaCode: code } : {}),
      next,
    });
    if (result && !result.ok) {
      setServerError(result.message ?? 'Sign-in failed.');
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (field === 'email' || field === 'password' || field === 'mfaCode') {
            setError(field, { message: messages[0] });
          }
        }
      }
      if (result.message?.toLowerCase().includes('code')) setShowMfa(true);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" aria-invalid={Boolean(errors.email)} {...register('email')} />
        <FieldError>{errors.email?.message}</FieldError>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-xs text-accent hover:underline">
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
        <FieldError>{errors.password?.message}</FieldError>
      </div>

      {showMfa ? (
        <div className="space-y-1.5">
          <Label htmlFor="mfaCode">Authenticator code</Label>
          <Input id="mfaCode" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={6} {...register('mfaCode')} />
          <FieldError>{errors.mfaCode?.message}</FieldError>
          <p className="text-xs text-muted">Enter the current code from your authenticator app or a recovery code.</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowMfa(true)}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
        >
          <KeyRound className="h-3.5 w-3.5" aria-hidden /> Using an authenticator app?
        </button>
      )}

      {serverError ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {serverError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" loading={isSubmitting}>
        <LogIn className="h-4 w-4" aria-hidden /> {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
