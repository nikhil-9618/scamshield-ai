import type { Metadata } from 'next';
import Link from 'next/link';
import { BellRing } from 'lucide-react';
import type { NotificationDto, Paginated } from '@scamshield/shared-types';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { Alert, Badge, Card, CardContent, EmptyState } from '@/components/ui/primitives';
import { MarkAllReadButton } from '@/components/scamshield/notification-actions';
import { relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  await requireUser('/notifications');
  const result = await apiFetch<Paginated<NotificationDto> & { unread: number }>('/notifications?page=1&pageSize=50');

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-accent">Alerts</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Notifications</h1>
          <p className="text-sm text-muted">
            High-risk scan alerts, report moderation updates and account security events. Emails never contain submitted
            content.
          </p>
        </div>
        <MarkAllReadButton disabled={!result.ok || result.data.unread === 0} />
      </div>

      {!result.ok ? (
        <Alert variant="danger" title="Notifications could not be loaded">
          {result.error.message}
        </Alert>
      ) : result.data.items.length === 0 ? (
        <EmptyState
          icon={<BellRing className="h-5 w-5" />}
          title="No notifications yet"
          description="High-risk scans, report moderation and security changes will appear here."
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-line/70 pt-2">
            {result.data.items.map((notification) => {
              const scanId = typeof notification.metadata?.scanId === 'string' ? notification.metadata.scanId : null;
              return (
                <div key={notification.id} className="flex gap-3 py-4">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read ? 'bg-line' : 'bg-primary'}`}
                    aria-label={notification.read ? 'Read' : 'Unread'}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{notification.title}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                          {notification.type.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-[11px] text-muted">{relativeTime(notification.createdAt)}</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted">{notification.body}</p>
                    {scanId ? (
                      <Link href={`/scans/${scanId}`} className="inline-block text-xs text-accent hover:underline">
                        Open scan result
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
