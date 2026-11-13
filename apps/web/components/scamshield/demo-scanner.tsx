'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight, BadgeCheck, MessageSquareWarning, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Badge, RiskBadge, SeverityBadge } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * Scripted illustration for the landing page. It is explicitly labelled as an
 * example and never presents invented metrics or live analysis.
 */
const SAMPLES = [
  {
    id: 'job',
    label: 'Fake internship',
    channel: 'WhatsApp',
    score: 78,
    level: 'critical',
    text: 'Congratulations! You are selected for a work-from-home data entry internship. Earn ₹3,500 per day. Pay a refundable registration fee of ₹499 to confirm your seat. Contact HR on Telegram.',
    findings: [
      { title: 'Upfront payment requested', severity: 'high', evidence: '“refundable registration fee of ₹499”' },
      { title: 'Unrealistic earnings', severity: 'high', evidence: '“Earn ₹3,500 per day” with no experience required' },
      { title: 'Moves to a private channel', severity: 'medium', evidence: '“Contact HR on Telegram”' },
    ],
  },
  {
    id: 'kyc',
    label: 'Bank KYC',
    channel: 'SMS',
    score: 86,
    level: 'critical',
    text: 'Dear customer, your SBI account will be blocked today. Update your KYC immediately at sbi-kyc-verify.top and share the OTP with our executive.',
    findings: [
      { title: 'Requests secret credentials', severity: 'critical', evidence: 'Asks for the OTP' },
      { title: 'Claimed brand does not match the link', severity: 'critical', evidence: 'sbi-kyc-verify.top is not an official SBI domain' },
      { title: 'Fake KYC / account-blocking pattern', severity: 'high', evidence: 'KYC + “account will be blocked today”' },
    ],
  },
  {
    id: 'courier',
    label: 'Parcel fee',
    channel: 'SMS',
    score: 54,
    level: 'high',
    text: 'India Post: your parcel is held at customs. Pay ₹25 clearance fee within 24 hours at indiapost-delivery.xyz to avoid return.',
    findings: [
      { title: 'Courier / parcel scam pattern', severity: 'high', evidence: 'Parcel + customs clearance fee + link' },
      { title: 'Low-reputation top-level domain', severity: 'medium', evidence: 'Domain ends in .xyz' },
      { title: 'Urgency pressure', severity: 'medium', evidence: '“within 24 hours”' },
    ],
  },
] as const;

export function DemoScanner() {
  const [active, setActive] = useState(0);
  const sample = SAMPLES[active] ?? SAMPLES[0]!;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card/90 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/60 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted">
          <MessageSquareWarning className="h-4 w-4 text-accent" aria-hidden />
          Illustrative example — not a live scan
        </div>
        <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
          Example output
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line px-3 py-2" role="tablist" aria-label="Example scam types">
        {SAMPLES.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={index === active}
            onClick={() => setActive(index)}
            className={cn(
              'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
              index === active ? 'bg-primary/15 text-ink' : 'text-muted hover:bg-white/5 hover:text-ink',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-wider text-muted">{sample.channel} sample</span>
          <RiskBadge level={sample.level} score={sample.score} />
        </div>

        <p className="rounded-xl border border-line/80 bg-surface/60 p-3 font-mono text-[12.5px] leading-relaxed text-ink/90">
          {sample.text}
        </p>

        <div className="space-y-2">
          {sample.findings.map((finding) => (
            <div key={finding.title} className="flex items-start gap-3 rounded-xl border border-line/70 bg-white/[0.02] p-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink">{finding.title}</p>
                  <SeverityBadge severity={finding.severity} />
                </div>
                <p className="text-xs text-muted">{finding.evidence}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-warning/25 bg-warning/5 p-3 text-xs text-muted">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          Real results include the evidence, detection method, coverage and limitations behind every score.
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <Link
            href="/scan"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            Run a real check <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <BadgeCheck className="h-3.5 w-3.5 text-success" aria-hidden /> No example data is stored
          </span>
        </div>
      </div>
    </div>
  );
}
