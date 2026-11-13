import Link from 'next/link';
import {
  ArrowRight,
  BrainCircuit,
  Briefcase,
  Building2,
  Check,
  CreditCard,
  Eye,
  FileSearch,
  Headphones,
  Image as ImageIcon,
  Landmark,
  Link2,
  Lock,
  Mail,
  Package,
  QrCode,
  ScanSearch,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  Trophy,
  UserRoundX,
} from 'lucide-react';
import { PLAN_COPY } from '@scamshield/validation';
import { Badge, Button, Card, CardContent } from '@/components/ui/primitives';
import { SiteHeader } from '@/components/scamshield/site-header';
import { SiteFooter } from '@/components/scamshield/site-footer';
import { DemoScanner } from '@/components/scamshield/demo-scanner';

const CATEGORIES = [
  { icon: Briefcase, title: 'Fake jobs & internships', copy: 'Registration fees, unrealistic pay and “HR” contacts on messaging apps.' },
  { icon: Link2, title: 'Phishing links', copy: 'Look-alike domains, punycode tricks and credential-harvesting pages.' },
  { icon: CreditCard, title: 'Payment fraud', copy: 'Requests to pay, transfer or scan before anything is delivered.' },
  { icon: Landmark, title: 'Fake bank KYC', copy: 'Account-blocked threats that push you to share OTPs or install apps.' },
  { icon: Smartphone, title: 'UPI scams', copy: 'Collect requests and QR codes that only ever move money out.' },
  { icon: Package, title: 'Courier scams', copy: 'Parcel-held messages demanding small “customs” or redelivery fees.' },
  { icon: Headphones, title: 'Fake support', copy: 'Unofficial helplines and remote-access tools used to control your device.' },
  { icon: QrCode, title: 'Malicious QR codes', copy: 'Decoded before you tap, with a warning instead of an automatic redirect.' },
  { icon: Mail, title: 'Phishing email', copy: 'Reply-To mismatches, spoofed display names and failing authentication.' },
  { icon: Building2, title: 'Fake government schemes', copy: 'Benefits that require a fee or personal data over chat.' },
  { icon: UserRoundX, title: 'Impersonation', copy: 'Brand claims that do not match the domain or caller identity.' },
  { icon: TrendingUp, title: 'Investment fraud', copy: 'Guaranteed returns, fake trading groups and blocked withdrawals.' },
];

const STEPS = [
  {
    title: 'Submit what you received',
    copy: 'Paste a message, link or email, or upload a screenshot or QR image. Nothing is shared publicly.',
  },
  {
    title: 'Multiple signals are checked',
    copy: 'Deterministic rules, URL structure, header authentication, DNS/TLS facts and threat-intelligence feeds run independently.',
  },
  {
    title: 'You see the evidence, not just a verdict',
    copy: 'Every finding lists the exact phrase, method, source, timestamp and recommended action behind it.',
  },
  {
    title: 'Decide with clear next steps',
    copy: 'A plain-language explanation can summarise the findings and tell you what to do — and what remains uncertain.',
  },
];

const CAPABILITIES = [
  {
    icon: FileSearch,
    title: 'Message & job-offer analysis',
    copy: 'Urgency pressure, upfront payments, OTP requests, KYC language, fake recruiter patterns and impossible earnings — each with the matched evidence.',
  },
  {
    icon: Link2,
    title: 'SSRF-hardened URL inspection',
    copy: 'Private and cloud-metadata addresses are refused, DNS results are validated and pinned, every redirect is re-checked, and JavaScript is never executed.',
  },
  {
    icon: ImageIcon,
    title: 'Screenshot OCR',
    copy: 'Text is extracted from PNG/JPEG screenshots, then URLs and phone numbers are analysed. Temporary files are never kept.',
  },
  {
    icon: QrCode,
    title: 'QR decoding without opening',
    copy: 'QR codes are decoded offline. If the payload is a link, it is analysed; it is never opened automatically in your browser.',
  },
  {
    icon: Mail,
    title: 'Email header intelligence',
    copy: 'Reply-To and Return-Path mismatches, display-name impersonation, SPF/DKIM/DMARC results when present — absence is never treated as fraud.',
  },
  {
    icon: BrainCircuit,
    title: 'Constrained AI explanations',
    copy: 'A language model can explain the structured findings in simple language. It never decides the score and never sees anything but the evidence.',
  },
];

const TRUST_POINTS = [
  {
    icon: Eye,
    title: 'Explainable by default',
    copy: 'Each score is the sum of disclosed findings. You can see every contribution and the limitations of the check.',
  },
  {
    icon: Lock,
    title: 'Data minimisation',
    copy: 'Submitted content is hashed. Full content is stored only if you explicitly opt in, encrypted, with a retention limit you control.',
  },
  {
    icon: ShieldCheck,
    title: 'No automatic clicking',
    copy: 'Decoded QR destinations and suspicious links are shown as text with warnings. ScamShield never follows them on your behalf.',
  },
  {
    icon: Sparkles,
    title: 'AI is labelled, never trusted blindly',
    copy: 'Explanations are marked as AI-generated or rule-based. The verdict always comes from deterministic rules plus intelligence.',
  },
];

const FAQS = [
  {
    q: 'Does ScamShield AI store the messages I paste?',
    a: 'Only a redacted preview (with emails and phone numbers masked) and a hash are stored so you can review your history. The full text or image is stored only when you switch on “Store this scan content”. In that case it is encrypted and deleted after your chosen retention period.',
  },
  {
    q: 'Is a low risk score a guarantee that something is safe?',
    a: 'No. A low score means no known indicators were found in the signals we could check. New scams appear constantly, and attackers can hide behind legitimate services. Verify unexpected requests for money or codes through a channel you find yourself.',
  },
  {
    q: 'Why does an HTTPS padlock not mean a site is safe?',
    a: 'HTTPS encrypts the connection; it does not verify who owns the site. Most phishing pages use valid HTTPS certificates. ScamShield analyses the domain, redirects, page content and reputation instead of treating HTTPS as trust.',
  },
  {
    q: 'What happens when threat-intelligence providers are unavailable?',
    a: 'The scan still runs using built-in rules, and the result explicitly lists which sources were unavailable. Silence from a provider is never presented as evidence of safety.',
  },
  {
    q: 'Can I scan a QR code without opening the link?',
    a: 'Yes. The image is decoded on the server, the payload is displayed, and any URL goes through the same protected URL analysis. ScamShield never opens the destination in your browser.',
  },
  {
    q: 'How are community reports used?',
    a: 'Reports are moderated before they influence anything. A single report never marks a domain as malicious. Verified reports can be promoted into the threat registry with the moderator and source recorded.',
  },
  {
    q: 'Does the AI decide whether something is a scam?',
    a: 'No. The risk score comes from explicit rule, URL, header and intelligence findings. The language model only translates those findings into a readable explanation and is labelled as AI-generated.',
  },
  {
    q: 'What should I do if I already sent money?',
    a: 'Contact your bank immediately and report the transaction. In India, call 1930 or file a complaint at cybercrime.gov.in as soon as possible. Preserve screenshots and transaction references.',
  },
];

export default function LandingPage() {
  return (
    <div className="page-canvas min-h-dvh">
      <SiteHeader />
      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 grid-overlay" aria-hidden />
          <div className="container relative grid gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
            <div className="space-y-7">
              <Badge variant="accent" className="w-fit">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Consumer fraud protection for India
              </Badge>
              <div className="space-y-5">
                <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                  Before You Trust It,{' '}
                  <span className="bg-gradient-to-r from-primary via-indigo-300 to-accent bg-clip-text text-transparent">
                    Check It.
                  </span>
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-muted sm:text-lg">
                  Detect suspicious links, fraudulent messages, fake job offers and online scams with intelligent
                  cybersecurity analysis.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href="/scan">
                    Scan Something Suspicious <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link href="#how-it-works">Explore Features</Link>
                </Button>
              </div>
              <ul className="grid gap-2 text-sm text-muted sm:grid-cols-2">
                {[
                  'Evidence attached to every finding',
                  'Content stored only with your consent',
                  'Links and QR destinations never auto-opened',
                  'Graceful, disclosed fallbacks when data is missing',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <DemoScanner />
          </div>
        </section>

        {/* Categories */}
        <section id="categories" className="border-t border-line/60 bg-surface/30 py-16 lg:py-20">
          <div className="container space-y-10">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Scam categories</p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Built around the scams people actually receive
              </h2>
              <p className="text-muted">
                Rules and intelligence are tuned for Indian messaging patterns — UPI requests, bank KYC threats, parcel
                fees, government schemes and fake recruiters.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CATEGORIES.map(({ icon: Icon, title, copy }) => (
                <Card key={title} className="transition-colors hover:border-primary/30">
                  <CardContent className="flex gap-3 pt-5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-white/5 text-accent">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-ink">{title}</p>
                      <p className="text-xs leading-relaxed text-muted">{copy}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="py-16 lg:py-24">
          <div className="container grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">How ScamShield works</p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                An investigation, not a verdict machine
              </h2>
              <p className="max-w-md text-muted">
                Every scan runs independent checks and then shows you exactly what it found. The risk score is a
                transparent sum of those findings — not a black-box probability.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="outline">Rules</Badge>
                <Badge variant="outline">NLP signal</Badge>
                <Badge variant="outline">URL & TLS facts</Badge>
                <Badge variant="outline">Threat intelligence</Badge>
              </div>
            </div>
            <ol className="space-y-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4 rounded-2xl border border-line bg-card/60 p-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 font-mono text-sm text-primary">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="space-y-1">
                    <p className="font-medium text-ink">{step.title}</p>
                    <p className="text-sm leading-relaxed text-muted">{step.copy}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="border-y border-line/60 bg-surface/30 py-16 lg:py-24">
          <div className="container space-y-10">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div className="max-w-2xl space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Detection capabilities</p>
                <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Five scanners, one evidence trail</h2>
                <p className="text-muted">
                  Messages, URLs, screenshots, QR codes and email use the same scoring engine and the same transparent
                  finding format.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/register">Try the scanner</Link>
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map(({ icon: Icon, title, copy }) => (
                <Card key={title}>
                  <CardContent className="space-y-3 pt-5">
                    <span className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white/5 text-primary">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <p className="font-medium text-ink">{title}</p>
                    <p className="text-sm leading-relaxed text-muted">{copy}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Trust */}
        <section className="py-16 lg:py-24">
          <div className="container grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-start">
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Why trust ScamShield</p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Honest about what it can and cannot know
              </h2>
              <p className="text-muted">
                No fabricated customer counts, no invented detection rates, no “100% safe” promises. The product is
                designed to show its work and to stay useful when a data source is missing.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {TRUST_POINTS.map(({ icon: Icon, title, copy }) => (
                  <div key={title} className="rounded-xl border border-line bg-card/50 p-4">
                    <Icon className="h-4 w-4 text-accent" aria-hidden />
                    <p className="mt-2 text-sm font-medium text-ink">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{copy}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Example finding anatomy */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Anatomy of a result</p>
                <Badge variant="outline">Example, not a live scan</Badge>
              </div>
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink">Fake internship message</p>
                      <p className="text-xs text-muted">Message scanner · Critical risk</p>
                    </div>
                    <span className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-1.5 font-mono text-sm text-danger">
                      78/100
                    </span>
                  </div>
                  <div className="rounded-xl border border-line/80 bg-surface/50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-ink">Upfront payment requested</p>
                      <Badge variant="danger">high</Badge>
                    </div>
                    <dl className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-muted/70">Evidence</dt>
                        <dd className="text-ink/90">“refundable registration fee of ₹499”</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-muted/70">Detection method</dt>
                        <dd>Deterministic rule</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-muted/70">Source</dt>
                        <dd>ScamShield rules · v2026.11.1</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-muted/70">Score impact</dt>
                        <dd className="font-mono">+34</dd>
                      </div>
                    </dl>
                    <p className="mt-3 border-t border-line/70 pt-3 text-xs text-muted">
                      <span className="text-ink">Recommended action:</span> no genuine employer charges a candidate to
                      join. Verify the company through its official careers page before paying anything.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[
                      ['Signals evaluated', '14'],
                      ['Signals triggered', '3'],
                      ['External providers', '2 used'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-line bg-white/[0.02] p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
                        <p className="font-mono text-sm text-ink">{value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted/80">
                    Risk scores are provisional product thresholds, not validated probabilities of fraud. Results always
                    include their limitations.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-y border-line/60 bg-surface/30 py-16 lg:py-24">
          <div className="container space-y-10">
            <div className="mx-auto max-w-2xl space-y-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Pricing</p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Start with the scanner, not a sales call</h2>
              <p className="text-muted">
                Every plan includes all five scanners and the full evidence view. Prices are in Indian rupees per month.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {PLAN_COPY.map((plan) => (
                <Card key={plan.slug} className={plan.slug === 'plus' ? 'border-primary/40' : undefined}>
                  <CardContent className="flex h-full flex-col gap-5 pt-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-ink">{plan.name}</p>
                        {plan.slug === 'plus' ? <Badge variant="primary">Most useful</Badge> : null}
                      </div>
                      <p className="font-mono text-3xl font-semibold text-ink">
                        ₹{plan.priceMonthlyInr}
                        <span className="text-sm font-normal text-muted">/month</span>
                      </p>
                      <p className="text-xs text-muted">{plan.dailyScanLimit} scans per day</p>
                    </div>
                    <ul className="flex-1 space-y-2 text-sm text-muted">
                      {plan.highlights.map((highlight) => (
                        <li key={highlight} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                          {highlight}
                        </li>
                      ))}
                    </ul>
                    <Button asChild variant={plan.slug === 'plus' ? 'primary' : 'outline'} className="w-full">
                      <Link href="/register">{plan.priceMonthlyInr === 0 ? 'Start free' : 'Create account'}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-center text-xs text-muted">
              This deployment does not process payments. Paid plan entitlements are not activated automatically; the free
              plan and its limits apply until billing is configured.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-16 lg:py-24">
          <div className="container grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">FAQ</p>
              <h2 className="text-3xl font-semibold tracking-tight">Questions people actually ask</h2>
              <p className="text-sm text-muted">
                Still unsure about something? Review the{' '}
                <Link className="text-accent hover:underline" href="/privacy">
                  privacy and data-handling page
                </Link>
                .
              </p>
            </div>
            <div className="divide-y divide-line rounded-2xl border border-line bg-card/50">
              {FAQS.map((faq) => (
                <details key={faq.q} className="group px-5 py-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-ink marker:hidden">
                    <span className="flex items-center justify-between gap-4">
                      {faq.q}
                      <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="pb-20">
          <div className="container">
            <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-accent/10 p-8 sm:p-12">
              <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary/20 blur-3xl" aria-hidden />
              <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div className="max-w-xl space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Something feels off? Check it before you click.</h2>
                  <p className="text-sm text-muted">
                    Free to start. No card required. Your content is only stored when you ask us to.
                  </p>
                </div>
                <Button asChild size="lg">
                  <Link href="/register">
                    Create a free account <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
