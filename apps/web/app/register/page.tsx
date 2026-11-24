import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { RegisterForm } from '@/components/auth/register-form';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage() {
  // Only a session the API still recognises may skip the form; a stale cookie must not.
  if (await getSession()) redirect('/dashboard');
  return (
    <AuthShell
      title="Create your account"
      description="Free to start. All five scanners, transparent findings and full history."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
