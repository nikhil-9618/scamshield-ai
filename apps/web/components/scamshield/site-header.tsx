import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { getSession } from '@/lib/session';

export async function SiteHeader() {
  const session = await getSession();
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="ScamShield AI home">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-primary/30 bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            ScamShield <span className="text-primary">AI</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-6 text-sm text-muted md:flex">
          <Link className="transition-colors hover:text-ink" href="/#categories">
            Threats
          </Link>
          <Link className="transition-colors hover:text-ink" href="/#how-it-works">
            How it works
          </Link>
          <Link className="transition-colors hover:text-ink" href="/#capabilities">
            Detection
          </Link>
          <Link className="transition-colors hover:text-ink" href="/#pricing">
            Pricing
          </Link>
          <Link className="transition-colors hover:text-ink" href="/#faq">
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {session ? (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/scan">Scan something</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Start free</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
