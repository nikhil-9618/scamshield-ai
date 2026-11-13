import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  FileClock,
  Flag,
  Globe2,
  HeartPulse,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { requireAdmin } from '@/lib/session';
import { Badge } from '@/components/ui/primitives';
import { logoutAction } from '@/lib/actions';

const LINKS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, adminOnly: false },
  { href: '/admin/reports', label: 'Report moderation', icon: Flag, adminOnly: false },
  { href: '/admin/users', label: 'Users & roles', icon: Users, adminOnly: true },
  { href: '/admin/threats', label: 'Threat registry', icon: Globe2, adminOnly: true },
  { href: '/admin/health', label: 'System health', icon: HeartPulse, adminOnly: true },
  { href: '/admin/audit', label: 'Audit log', icon: FileClock, adminOnly: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const isAdmin = session.user.roles.includes('admin');

  return (
    <div className="page-canvas min-h-dvh">
      <header className="border-b border-line/70 bg-surface/50">
        <div className="container flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-primary/30 bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">ScamShield AI · Admin</p>
              <p className="text-[11px] text-muted">
                Signed in as {session.user.email} ·{' '}
                <Badge variant="outline" className="align-middle text-[10px]">
                  {session.user.roles.join(', ')}
                </Badge>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 hover:text-ink">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to app
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="rounded-lg border border-line px-2.5 py-1.5 hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="container flex gap-1 overflow-x-auto pb-2">
          {LINKS.filter((link) => isAdmin || !link.adminOnly).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex whitespace-nowrap items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-white/5 hover:text-ink"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
            </Link>
          ))}
        </div>
      </header>
      <main id="main" className="container py-8">
        {children}
      </main>
      <footer className="container flex items-center gap-2 pb-8 text-[11px] text-muted/70">
        <Activity className="h-3.5 w-3.5" aria-hidden /> Administrative actions are recorded in the audit log. Role checks are
        enforced by the API, not this interface.
      </footer>
    </div>
  );
}
