import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="page-canvas grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line/70 p-10 lg:flex">
        <div className="pointer-events-none absolute inset-0 grid-overlay" aria-hidden />
        <Link href="/" className="relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-primary/30 bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          </span>
          <span className="text-sm font-semibold">ScamShield AI</span>
        </Link>
        <div className="relative max-w-md space-y-5">
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight">
            “Before you trust it, check it.”
          </h2>
          <p className="text-sm leading-relaxed text-muted">
            Five scanners built around the scams people actually receive in India — fake jobs, bank KYC threats, parcel
            fees, UPI requests, phishing links and QR codes.
          </p>
          <ul className="space-y-2 text-sm text-muted">
            {[
              'Evidence for every finding',
              'Full content stored only with consent',
              'Links and QR destinations never auto-opened',
              'Clear limits on what was checked',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-muted/80">
          Risk scores are transparent heuristics, not probabilities of fraud. ScamShield AI cannot guarantee safety.
        </p>
      </div>

      <div className="flex flex-col justify-center px-5 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-sm space-y-7">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            <span className="text-sm font-semibold">ScamShield AI</span>
          </Link>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted">{description}</p>
          </div>
          {children}
          {footer ? <div className="text-sm text-muted">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
