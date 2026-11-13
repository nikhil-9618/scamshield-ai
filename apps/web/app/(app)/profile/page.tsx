import type { Metadata } from 'next';
import Link from 'next/link';
import type { ActivityEventDto, SessionDto, UserProfile } from '@scamshield/shared-types';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { Alert, Button, Card, CardContent } from '@/components/ui/primitives';
import { SettingsClient } from '@/components/profile/settings-client';

export const metadata: Metadata = { title: 'Security centre' };

export default async function ProfilePage() {
  const session = await requireUser('/profile');
  const [profile, sessions, activity] = await Promise.all([
    apiFetch<UserProfile>('/users/me'),
    apiFetch<{ items: SessionDto[] }>('/users/me/sessions'),
    apiFetch<{ items: ActivityEventDto[] }>('/users/me/activity'),
  ]);

  if (!profile.ok) {
    return (
      <Alert variant="danger" title="Account details could not be loaded">
        <p>{profile.error.message}</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/profile">Retry</Link>
        </Button>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Security centre</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your account</h1>
        <p className="text-sm text-muted">
          Manage preferences, sessions, multi-factor authentication and the data ScamShield keeps about you.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col justify-between gap-3 pt-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-ink">{session.user.displayName}</p>
            <p className="text-xs text-muted">
              {session.user.email} · member since {new Date(session.user.createdAt).toLocaleDateString('en-IN')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span className="rounded-full border border-line px-2 py-0.5">{session.user.plan?.name ?? 'Guardian Free'}</span>
            <span className="rounded-full border border-line px-2 py-0.5">
              {session.user.emailVerified ? 'Email verified' : 'Email not verified'}
            </span>
            <span className="rounded-full border border-line px-2 py-0.5">
              MFA {session.user.mfaEnabled ? 'enabled' : 'off'}
            </span>
            <span className="rounded-full border border-line px-2 py-0.5 capitalize">{session.user.roles.join(', ')}</span>
          </div>
        </CardContent>
      </Card>

      <SettingsClient
        profile={profile.data}
        sessions={sessions.ok ? sessions.data.items : []}
        activity={activity.ok ? activity.data.items : []}
      />
    </div>
  );
}
