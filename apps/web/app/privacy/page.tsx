import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { SiteHeader } from '@/components/scamshield/site-header';
import { SiteFooter } from '@/components/scamshield/site-footer';
import { Card, CardContent } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Privacy and data handling' };

export default function PrivacyPage() {
  return (
    <div className="page-canvas min-h-dvh">
      <SiteHeader />
      <main id="main" className="container max-w-3xl space-y-6 py-16">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          <ShieldCheck className="h-4 w-4" aria-hidden /> Trust centre
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Privacy and data handling</h1>
        <p className="text-muted">
          This page describes what ScamShield AI actually does with the material you submit. It is written to match the
          implementation in this repository, not an aspirational policy.
        </p>

        {[
          {
            title: 'What is stored by default',
            body: 'For every scan we store the scan type, timestamp, risk score, findings, extracted entities, a SHA-256 hash of the submitted content and a redacted preview (emails, phone numbers and UPI IDs masked, capped at 280 characters). The full message, email, URL or OCR text is not kept after processing.',
          },
          {
            title: 'Opting in to content storage',
            body: 'If you enable “Store this scan content”, the submitted content is encrypted with AES-256-GCM before it reaches the database. It is returned only to your account and deleted after the retention period set in your privacy settings (default 30 days, maximum 365). You can delete any scan or your entire history at any time.',
          },
          {
            title: 'Images and temporary files',
            body: 'Screenshots and QR images are processed in memory, never written to public storage and never executed. Only the extracted text (screenshots) or decoded payload (QR) is retained under the rules above.',
          },
          {
            title: 'Third-party threat intelligence',
            body: 'When a provider is configured, the URL and domain you submit may be sent to Google Safe Browsing, VirusTotal, URLhaus or PhishTank to look up reputation. Those services receive the URL, not your account identity. If a provider is unavailable, the result lists it as unavailable rather than assuming the URL is clean.',
          },
          {
            title: 'AI explanations',
            body: 'Language-model explanations receive structured findings only — never the raw message, email or page content. Explanations are labelled as AI-generated, validated against a strict format and rate-limited. Without a configured model, a deterministic template is used and labelled as rule-based.',
          },
          {
            title: 'Community reports',
            body: 'Reports are visible to moderators with your account email so abuse can be investigated. Public threat pages show the domain, category and verification state only. Phone numbers and email addresses are masked in your own report list.',
          },
          {
            title: 'Account deletion and export',
            body: 'You can download a JSON export of your profile, scans, reports and feedback from the security centre. Deleting your account removes your profile, sessions, scans and notifications. Community reports remain for moderation integrity but are detached from your identity.',
          },
          {
            title: 'Security controls',
            body: 'Passwords are hashed with Argon2id. Sessions use opaque 256-bit tokens stored hashed, with HttpOnly cookies, a CSRF token bound to the session and revocation per device. Administrative actions are recorded in an audit log. No system is completely secure; report suspected issues responsibly.',
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
