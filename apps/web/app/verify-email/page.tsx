import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { VerifyEmailPanel } from '@/components/auth/verify-email-panel';

export const metadata: Metadata = { title: 'Verify email' };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return (
    <AuthShell
      title="Verify your email"
      description="Verification confirms you can receive security and account alerts."
      footer={
        <Link href="/login" className="text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <VerifyEmailPanel token={params.token ?? null} />
    </AuthShell>
  );
}
