'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Flag,
  Globe2,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanLine,
  ShieldCheck,
  ShieldQuestion,
  UserRound,
  X,
} from 'lucide-react';
import type { UserProfile } from '@scamshield/shared-types';
import { Button } from '@/components/ui/primitives';
import { logoutAction } from '@/lib/actions';
import { cn } from '@/lib/utils';

const PRIMARY_LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/scan', label: 'Scan centre', icon: ScanLine },
  { href: '/scans', label: 'Scan history', icon: History },
  { href: '/reports', label: 'Community reports', icon: Flag },
  { href: '/threats', label: 'Threat intelligence', icon: Globe2 },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/profile', label: 'Security centre', icon: UserRound },
];

export function AppChrome({
  user,
  unread,
  children,
}: {
  user: UserProfile;
  unread: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isAdmin = user.roles.includes('admin') || user.roles.includes('moderator');

  const links = isAdmin ? [...PRIMARY_LINKS, { href: '/admin', label: 'Admin console', icon: ShieldCheck }] : PRIMARY_LINKS;

  const nav = (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Application">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              active ? 'bg-primary/15 text-ink' : 'text-muted hover:bg-white/5 hover:text-ink',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted')} aria-hidden />
            <span className="flex-1">{label}</span>
            {href === '/notifications' && unread > 0 ? (
              <span className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] text-white">{unread}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-3 py-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-primary/30 bg-primary/10">
        <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
      </span>
      <span className="text-sm font-semibold tracking-tight">
        ScamShield <span className="text-primary">AI</span>
      </span>
    </Link>
  );

  return (
    <div className="min-h-dvh bg-canvas lg:pl-[260px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-line/70 bg-surface/40 px-3 py-4 lg:flex">
        {brand}
        <div className="mt-4 flex flex-1 flex-col gap-4">
          {nav}
          <div className="rounded-xl border border-line bg-card/60 p-3 text-xs text-muted">
            <p className="font-medium text-ink">{user.plan?.name ?? 'Guardian Free'}</p>
            <p className="mt-0.5">
              {user.plan?.dailyScanLimit ?? 10} scans / day · {user.plan?.monthlyScanLimit ?? 100} / month
            </p>
            <Link href="/profile" className="mt-2 inline-block text-accent hover:underline">
              Manage account
            </Link>
          </div>
          <div className="border-t border-line pt-3">
            <p className="truncate px-3 text-xs text-muted">{user.email}</p>
            <form action={logoutAction}>
              <button
                type="submit"
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-white/5 hover:text-ink"
              >
                <LogOut className="h-4 w-4" aria-hidden /> Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-canvas/80 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-line bg-surface px-3 py-4">
            <div className="flex items-center justify-between">
              {brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-ink"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-1 flex-col">{nav}</div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-ink"
              >
                <LogOut className="h-4 w-4" aria-hidden /> Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/85 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-lg border border-line p-2 text-muted hover:text-ink"
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold">ScamShield AI</span>
            </div>
            <div className="hidden items-center gap-2 text-xs text-muted lg:flex">
              <ShieldQuestion className="h-3.5 w-3.5 text-accent" aria-hidden />
              Risk scores are transparent heuristics, not probabilities of fraud.
            </div>
            <div className="flex items-center gap-3">
              {!user.emailVerified ? (
                <Link
                  href="/verify-email"
                  className="hidden rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] text-warning sm:inline-flex"
                >
                  Verify email
                </Link>
              ) : null}
              <Link
                href="/notifications"
                className="relative rounded-lg border border-line p-2 text-muted transition-colors hover:text-ink"
                aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
              >
                <Bell className="h-4 w-4" aria-hidden />
                {unread > 0 ? (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 font-mono text-[10px] text-white">
                    {unread}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/profile"
                className="hidden items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted hover:text-ink sm:flex"
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/20 font-mono text-[10px] text-primary">
                  {user.displayName.slice(0, 1).toUpperCase()}
                </span>
                {user.displayName.split(' ')[0]}
              </Link>
              <Button asChild size="sm">
                <Link href="/scan">New scan</Link>
              </Button>
            </div>
          </div>
        </header>
        <main id="main" className="flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
