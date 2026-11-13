import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith('/') ? params.next : undefined;
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to review your scans, alerts and security settings."
      footer={
        <>
          New to ScamShield?{' '}
          <Link href="/register" className="text-accent hover:underline">
            Create a free account
          </Link>
        </>
      }
    >
      <LoginForm next={next} />
      <p className="text-[11px] leading-relaxed text-muted/80">
        Sessions are stored in an HttpOnly cookie and can be revoked from your security centre. Repeated failed attempts
        temporarily lock sign-in.
      </p>
    </AuthShell>
  );
}
