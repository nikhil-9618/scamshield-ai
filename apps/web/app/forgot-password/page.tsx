import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Reset password' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="We will send a single-use link if an account exists for that address."
      footer={
        <Link href="/login" className="text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
      <p className="text-[11px] leading-relaxed text-muted/80">
        For privacy, this page gives the same response whether or not an account exists. Reset links expire after one
        hour and revoke all existing sessions when used.
      </p>
    </AuthShell>
  );
}
