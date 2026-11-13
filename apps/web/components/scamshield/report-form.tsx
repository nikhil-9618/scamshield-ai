'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CATEGORY_LABELS, type ScamCategory } from '@scamshield/shared-types';
import { Flag } from 'lucide-react';
import { Alert, Button, FieldError, Input, Label, Textarea } from '@/components/ui/primitives';
import { submitReportAction } from '@/lib/actions';

const TARGET_TYPES = [
  { value: 'domain', label: 'Domain / website' },
  { value: 'url', label: 'Specific URL' },
  { value: 'phone', label: 'Phone number' },
  { value: 'email', label: 'Email address' },
  { value: 'message', label: 'Message content' },
] as const;

const CATEGORIES = Object.entries(CATEGORY_LABELS)
  .filter(([key]) => key !== 'unknown')
  .map(([value, label]) => ({ value, label }));

export function ReportForm({ defaultTarget = '', defaultTargetType = 'domain' }: { defaultTarget?: string; defaultTargetType?: string }) {
  const router = useRouter();
  const [targetType, setTargetType] = useState(defaultTargetType);
  const [target, setTarget] = useState(defaultTarget);
  const [category, setCategory] = useState('phishing');
  const [description, setDescription] = useState('');
  const [evidence, setEvidence] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    setFieldErrors(null);
    if (description.trim().length < 30) {
      setError('Describe what happened in at least 30 characters. Specific details help moderators.');
      return;
    }
    setPending(true);
    const evidenceUrls = evidence
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 5);
    const result = await submitReportAction({
      targetType: targetType as 'domain' | 'url' | 'phone' | 'message' | 'email',
      target,
      category: category as ScamCategory,
      description,
      evidenceUrls,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? 'Could not submit the report.');
      setFieldErrors(result.fieldErrors ?? null);
      return;
    }
    toast.success('Report submitted for moderation');
    setDescription('');
    setEvidence('');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="targetType">What are you reporting?</Label>
          <select
            id="targetType"
            value={targetType}
            onChange={(event) => setTargetType(event.target.value)}
            className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
          >
            {TARGET_TYPES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="target">Target</Label>
          <Input
            id="target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder={targetType === 'domain' ? 'example-scam.com' : targetType === 'phone' ? '+919876543210' : 'Details'}
          />
          <FieldError>{fieldErrors?.target?.[0]}</FieldError>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
        >
          {CATEGORIES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">What happened?</Label>
        <Textarea
          id="description"
          rows={5}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe the message, the request for money or codes, and how you received it. Do not include your own OTPs, passwords or full card numbers."
          maxLength={4000}
        />
        <div className="flex justify-between text-[11px] text-muted">
          <span>Minimum 30 characters.</span>
          <span className="font-mono">{description.length}/4000</span>
        </div>
        <FieldError>{fieldErrors?.description?.[0]}</FieldError>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="evidence">Evidence URLs (optional)</Label>
        <Textarea
          id="evidence"
          rows={2}
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
          placeholder="One URL per line, up to five"
          className="font-mono text-xs"
        />
      </div>

      <Alert variant="info" title="Reports are moderated">
        A single report never marks a domain as malicious. Moderators review evidence, remove duplicates and decide whether
        to add the target to the verified threat registry. Reports from your account show your email to moderators only.
      </Alert>

      {error ? <Alert variant="danger" title="Report not submitted">{error}</Alert> : null}

      <Button onClick={submit} loading={pending} disabled={!target.trim() || description.trim().length < 30}>
        <Flag className="h-4 w-4" aria-hidden /> Submit report
      </Button>
    </div>
  );
}
