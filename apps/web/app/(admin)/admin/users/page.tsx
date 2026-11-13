import { redirect } from 'next/navigation';
import type { Paginated } from '@scamshield/shared-types';
import { apiFetch } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives';
import { UserRowActions } from '@/components/admin/admin-actions';
import { formatDate } from '@/lib/utils';

interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  emailVerified: boolean;
  mfaEnabled: boolean;
  suspended: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  scanCount: number;
  reportCount: number;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin('/admin/users');
  if (!session.user.roles.includes('admin')) redirect('/admin/reports');
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const result = await apiFetch<Paginated<AdminUserRow>>(`/admin/users?page=1&pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}`);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Access control</p>
        <h1 className="text-2xl font-semibold tracking-tight">Users & roles</h1>
        <p className="text-sm text-muted">
          Role changes and suspensions are audited. The API refuses to remove the last admin or to suspend your own account.
        </p>
      </div>

      <form method="get" className="flex max-w-md gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by email or name"
          className="h-10 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70"
          aria-label="Search users"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>Suspended accounts have active sessions revoked immediately.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!result.ok ? (
            <Alert variant="danger" title="Users could not be loaded">
              {result.error.message}
            </Alert>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th scope="col" className="pb-2 pr-3 font-medium">User</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Roles</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Verification</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Activity</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Joined</th>
                  <th scope="col" className="pb-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {result.data.items.map((user) => (
                  <tr key={user.id} className={user.suspended ? 'opacity-60' : ''}>
                    <td className="py-3 pr-3">
                      <p className="text-sm text-ink">{user.displayName}</p>
                      <p className="text-xs text-muted">{user.email}</p>
                      {user.suspended ? (
                        <Badge variant="danger" className="mt-1">
                          Suspended
                        </Badge>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge key={role} variant={role === 'admin' ? 'primary' : 'outline'}>
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-xs text-muted">
                      <p>{user.emailVerified ? 'Email verified' : 'Email unverified'}</p>
                      <p>MFA {user.mfaEnabled ? 'enabled' : 'off'}</p>
                    </td>
                    <td className="py-3 pr-3 text-xs text-muted">
                      <p>{user.scanCount} scans</p>
                      <p>{user.reportCount} reports</p>
                      <p>Last login: {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'never'}</p>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 text-xs text-muted">{formatDate(user.createdAt)}</td>
                    <td className="py-3 text-right">
                      <UserRowActions user={user} actorId={session.user.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.ok ? (
            <p className="pt-3 text-[11px] text-muted/70">
              {result.data.total} account{result.data.total === 1 ? '' : 's'} · deleted accounts are excluded from this list.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
