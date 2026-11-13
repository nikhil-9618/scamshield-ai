import { requireUser } from '@/lib/session';
import { apiFetch } from '@/lib/api';
import { AppChrome } from '@/components/scamshield/app-chrome';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const unread = await apiFetch<{ unread: number }>('/notifications/unread-count');
  return (
    <AppChrome user={session.user} unread={unread.ok ? unread.data.unread : 0}>
      {children}
    </AppChrome>
  );
}
