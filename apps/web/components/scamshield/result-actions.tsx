'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Sparkles, ThumbsDown, ThumbsUp, TriangleAlert } from 'lucide-react';
import type { AiExplanation } from '@scamshield/shared-types';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { explainScanAction, submitFeedbackAction } from '@/lib/actions';

export function AiExplanationPanel({
  scanId,
  initial,
  riskLevel,
}: {
  scanId: string;
  initial: AiExplanation | null;
  riskLevel: string;
}) {
  const [explanation, setExplanation] = useState<AiExplanation | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden />
          <CardTitle>Plain-language explanation</CardTitle>
        </div>
        {explanation ? (
          <Badge variant={explanation.generator === 'llm' ? 'accent' : 'outline'}>
            {explanation.generator === 'llm' ? 'AI-generated' : 'Rule-based summary'}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {explanation ? (
          <>
            <div className="whitespace-pre-line rounded-xl border border-line bg-surface/50 p-4 text-sm leading-relaxed text-ink/90">
              {explanation.text}
            </div>
            <p className="text-[11px] leading-relaxed text-muted/80">
              {explanation.disclaimer}
              {explanation.model ? ` Model: ${explanation.model}.` : ''}
            </p>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Generate a summary of the findings above in simple language, including what could happen and what to do
              next. The explanation never changes the risk score.
            </p>
            <Button
              type="button"
              variant={riskLevel === 'high' || riskLevel === 'critical' ? 'primary' : 'outline'}
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await explainScanAction(scanId);
                  if (!result.ok || !result.data) {
                    setError(result.message ?? 'Could not generate an explanation.');
                    return;
                  }
                  setExplanation(result.data);
                })
              }
            >
              <Sparkles className="h-4 w-4" aria-hidden /> Explain this result
            </Button>
          </div>
        )}
        {error ? (
          <Alert variant="danger" title="Explanation unavailable">
            {error}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function FeedbackPanel({ scanId, initial }: { scanId: string; initial: { verdict: string; comment: string | null } | null }) {
  const [submitted, setSubmitted] = useState(initial?.verdict ?? null);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [pending, startTransition] = useTransition();

  function submit(verdict: 'correct' | 'incorrect' | 'unsure') {
    startTransition(async () => {
      const result = await submitFeedbackAction(scanId, verdict, comment.trim() || undefined);
      if (result.ok) {
        setSubmitted(verdict);
        toast.success('Thanks — feedback improves false-positive review.');
      } else {
        toast.error(result.message ?? 'Could not save feedback.');
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Was this result useful?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted">
          Feedback goes to the moderation queue for false-positive review. It never changes this scan’s score.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant={submitted === 'correct' ? 'primary' : 'outline'} size="sm" loading={pending} onClick={() => submit('correct')}>
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> Accurate
          </Button>
          <Button variant={submitted === 'incorrect' ? 'danger' : 'outline'} size="sm" loading={pending} onClick={() => submit('incorrect')}>
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden /> Looks wrong
          </Button>
          <Button variant={submitted === 'unsure' ? 'primary' : 'outline'} size="sm" loading={pending} onClick={() => submit('unsure')}>
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Not sure
          </Button>
        </div>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Optional: what did we get wrong or miss?"
          maxLength={1000}
          className="min-h-[70px] w-full rounded-xl border border-line bg-surface/80 px-3 py-2 text-xs text-ink placeholder:text-muted/70"
        />
        {submitted ? <p className="text-xs text-success">Feedback recorded ({submitted}).</p> : null}
      </CardContent>
    </Card>
  );
}

export function DecodedValue({ value }: { value: string }) {
  return (
    <div className="space-y-2">
      <p className="break-all rounded-lg border border-line bg-canvas/60 p-3 font-mono text-xs text-ink/90">{value}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            toast.success('Copied. Do not open it unless you trust the destination.');
          } catch {
            toast.error('Could not copy the value.');
          }
        }}
      >
        <Copy className="h-3.5 w-3.5" aria-hidden /> Copy value
      </Button>
    </div>
  );
}

export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= 20) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [router]);
  return <p className="text-xs text-muted">Refreshing automatically…</p>;
}
