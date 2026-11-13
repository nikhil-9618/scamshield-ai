import type { Metadata } from 'next';
import { Scale } from 'lucide-react';
import { SiteHeader } from '@/components/scamshield/site-header';
import { SiteFooter } from '@/components/scamshield/site-footer';
import { Alert, Card, CardContent } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Terms and limitations' };

export default function TermsPage() {
  return (
    <div className="page-canvas min-h-dvh">
      <SiteHeader />
      <main id="main" className="container max-w-3xl space-y-6 py-16">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          <Scale className="h-4 w-4" aria-hidden /> Terms
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Terms and limitations</h1>
        <Alert variant="warning" title="ScamShield AI is an assistive tool, not a guarantee">
          <p>
            A low risk score means no known indicators were found in the checks that could run. It does not prove that an
            item is safe. A high score does not prove fraud. Always verify money, credential and identity requests through
            a channel you establish independently.
          </p>
        </Alert>

        {[
          {
            title: 'Scores are heuristics',
            body: 'The 0–100 risk score is a transparent sum of disclosed weighted findings mapped to provisional thresholds (0–24 low, 25–49 moderate, 50–74 high, 75–100 critical). It is not a calibrated probability that something is fraudulent and should not be used as the sole basis for a financial or legal decision.',
          },
          {
            title: 'Model confidence',
            body: 'The statistical text classifier is evaluated on a synthetic dataset and is explicitly marked uncalibrated. It contributes a bounded supporting signal and never overrides deterministic findings or determines the verdict alone.',
          },
          {
            title: 'Availability of third-party data',
            body: 'Threat-intelligence providers may be unconfigured, rate-limited, unreachable or wrong. The product reports unavailable sources and never treats their silence as evidence of safety.',
          },
          {
            title: 'No automated interaction with hostile content',
            body: 'ScamShield never executes page JavaScript, never opens QR destinations in your browser and never downloads attachments. Some malicious pages therefore cannot be fully observed, and the result will say so.',
          },
          {
            title: 'Acceptable use',
            body: 'Do not submit content you have no right to share, use the service to harass others, attempt to scan private or internal networks, or submit automated bulk requests beyond your plan. Abuse controls, rate limits and audit logging are in place.',
          },
          {
            title: 'Reporting fraud in India',
            body: 'If you have lost money, call 1930 (National Cyber Crime Helpline) and file a report at cybercrime.gov.in. Contact your bank immediately; speed matters more than any scanner result.',
          },
        ].map((section) => (
          <Card key={section.title}>
            <CardContent className="space-y-2 pt-5">
              <h2 className="text-base font-semibold text-ink">{section.title}</h2>
              <p className="text-sm leading-relaxed text-muted">{section.body}</p>
            </CardContent>
          </Card>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
