import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="border-t border-line/70 bg-surface/40">
      <div className="container grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-primary/30 bg-primary/10">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            </span>
            <span className="text-sm font-semibold">ScamShield AI</span>
          </div>
          <p className="max-w-xs text-sm text-muted">
            Detect scams. Understand threats. Stay protected. An assistive cybersecurity tool for everyday internet
            users.
          </p>
          <p className="text-xs text-muted/80">
            ScamShield AI cannot guarantee that something is safe. Risk scores are transparent heuristics, not
            probabilities of fraud. If you have lost money, contact your bank and report it at cybercrime.gov.in.
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Product</p>
          <Link className="block text-muted hover:text-ink" href="/scan">
            Universal scanner
          </Link>
          <Link className="block text-muted hover:text-ink" href="/#capabilities">
            Detection capabilities
          </Link>
          <Link className="block text-muted hover:text-ink" href="/#pricing">
            Pricing
          </Link>
          <Link className="block text-muted hover:text-ink" href="/register">
            Create account
          </Link>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Trust</p>
          <Link className="block text-muted hover:text-ink" href="/privacy">
            Privacy & data handling
          </Link>
          <Link className="block text-muted hover:text-ink" href="/terms">
            Terms & limitations
          </Link>
          <Link className="block text-muted hover:text-ink" href="/threats">
            Threat intelligence
          </Link>
          <Link className="block text-muted hover:text-ink" href="/reports">
            Report a scam
          </Link>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Emergency</p>
          <p className="text-muted">
            Financial fraud in India: call 1930 or use cybercrime.gov.in. Report phishing to the affected organisation
            through its official channel.
          </p>
          <p className="pt-2 text-xs text-muted/80">© {new Date().getFullYear()} ScamShield AI. Built for India.</p>
        </div>
      </div>
    </footer>
  );
}
