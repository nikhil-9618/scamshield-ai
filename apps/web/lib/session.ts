import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { UserProfile } from '@scamshield/shared-types';
import { apiFetch, isUnauthorized } from './api';

export interface SessionInfo {
  user: UserProfile;
  csrfToken: string;
}

/** Request-scoped so multiple server components share one API call. */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const result = await apiFetch<SessionInfo>('/auth/session');
  if (!result.ok) return null;
  return result.data;
});

export async function requireUser(nextPath = '/dashboard'): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return session;
}

export async function requireAdmin(nextPath = '/admin'): Promise<SessionInfo> {
  const session = await requireUser(nextPath);
  if (!session.user.roles.includes('admin') && !session.user.roles.includes('moderator')) {
    redirect('/dashboard');
  }
  return session;
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return Boolean(session);
}

export { isUnauthorized };
