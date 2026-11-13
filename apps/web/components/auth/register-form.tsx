'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { emailSchema, passwordIssues } from '@scamshield/validation';
import { CheckCircle2, UserPlus } from 'lucide-react';
import { Button, FieldError, Input, Label } from '@/components/ui/primitives';
import { registerAction } from '@/lib/actions';
import { cn } from '@/lib/utils';

const formSchema = z
  .object({
    email: emailSchema,
    displayName: z.string().trim().min(2, 'Enter your name').max(60, 'Name is too long'),
    password: z
      .string()
      .min(12, 'Use at least 12 characters')
      .max(128, 'Use at most 128 characters')
      .refine((value) => /[a-z]/.test(value), 'Include a lowercase letter')
      .refine((value) => /[A-Z]/.test(value), 'Include an uppercase letter')
      .refine((value) => /[0-9]/.test(value), 'Include a number'),
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((value) => value, 'You must accept the terms to continue'),
    marketingOptIn: z.boolean().optional(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type FormValues = z.infer<typeof formSchema>;

const REQUIREMENTS = [
  { test: (value: string) => value.length >= 12, label: 'At least 12 characters' },
  { test: (value: string) => /[a-z]/.test(value) && /[A-Z]/.test(value), label: 'Upper and lower case letters' },
  { test: (value: string) => /\d/.test(value), label: 'At least one number' },
];

export function RegisterForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', displayName: '', password: '', confirmPassword: '', acceptTerms: false, marketingOptIn: false },
  });
  const password = watch('password');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const issues = passwordIssues(values.password);
    if (issues.length > 0) {
      setError('password', { message: issues[0] });
      return;
    }
    const result = await registerAction({
      email: values.email,
      password: values.password,
      displayName: values.displayName,
      acceptTerms: true,
      marketingOptIn: values.marketingOptIn ?? false,
    });
    if (result && !result.ok) {
      setServerError(result.message ?? 'Could not create the account.');
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (field === 'email' || field === 'password' || field === 'displayName') {
            setError(field, { message: messages[0] });
          }
        }
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="displayName">Name</Label>
        <Input id="displayName" autoComplete="name" placeholder="Your name" aria-invalid={Boolean(errors.displayName)} {...register('displayName')} />
        <FieldError>{errors.displayName?.message}</FieldError>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" aria-invalid={Boolean(errors.email)} {...register('email')} />
        <FieldError>{errors.email?.message}</FieldError>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="new-password" placeholder="Create a strong password" aria-invalid={Boolean(errors.password)} {...register('password')} />
        <ul className="mt-2 space-y-1">
          {REQUIREMENTS.map((requirement) => {
            const met = requirement.test(password ?? '');
            return (
              <li key={requirement.label} className={cn('flex items-center gap-1.5 text-[11px]', met ? 'text-success' : 'text-muted')}>
                <CheckCircle2 className={cn('h-3 w-3', met ? 'opacity-100' : 'opacity-40')} aria-hidden />
                {requirement.label}
              </li>
            );
          })}
        </ul>
        <FieldError>{errors.password?.message}</FieldError>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your password"
          aria-invalid={Boolean(errors.confirmPassword)}
          {...register('confirmPassword')}
        />
        <FieldError>{errors.confirmPassword?.message}</FieldError>
      </div>

      <div className="space-y-2 pt-1">
        <label className="flex items-start gap-2 text-xs text-muted">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-line bg-surface" {...register('acceptTerms')} />
          <span>
            I agree to the{' '}
            <a className="text-accent hover:underline" href="/terms" target="_blank" rel="noreferrer">
              terms and limitations
            </a>{' '}
            and understand that ScamShield AI cannot guarantee safety.
          </span>
        </label>
        <FieldError>{errors.acceptTerms?.message}</FieldError>
        <label className="flex items-start gap-2 text-xs text-muted">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-line bg-surface" {...register('marketingOptIn')} />
          <span>Send me occasional product updates. Security alerts are always delivered in-app.</span>
        </label>
      </div>

      {serverError ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {serverError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" loading={isSubmitting}>
        <UserPlus className="h-4 w-4" aria-hidden /> {isSubmitting ? 'Creating account…' : 'Create free account'}
      </Button>
    </form>
  );
}
