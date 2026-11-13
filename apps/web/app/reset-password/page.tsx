import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return (
    <AuthShell
      title="Choose a new password"
      description="Resetting your password signs out all other sessions."
      footer={
        <Link href="/login" className="text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      {params.token ? (
        <ResetPasswordForm token={params.token} />
      ) : (
        <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
          <p className="font-medium text-ink">Reset link is incomplete</p>
          <p className="text-muted">Open the link from your reset email, or request a new one.</p>
          <Link href="/forgot-password" className="inline-block text-accent hover:underline">
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
