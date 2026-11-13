'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Globe2, ShieldOff, ShieldCheck, X } from 'lucide-react';
import type { AdminCommunityReportDto } from '@scamshield/shared-types';
import { CATEGORY_LABELS } from '@scamshield/shared-types';
import { Badge, Button, FieldHint, Input, Label, Textarea } from '@/components/ui/primitives';
import { adminCreateThreatAction, adminUpdateUserAction, moderateReportAction } from '@/lib/actions';
import { formatDateTime, truncate } from '@/lib/utils';

const STATUS_VARIANT = {
  pending: 'warning',
  verified: 'success',
  rejected: 'danger',
  duplicate: 'outline',
} as const;

export function ModerationRow({ report }: { report: AdminCommunityReportDto }) {
  const router = useRouter();
  const [note, setNote] = useState(report.moderatorNote ?? '');
  const [addToIntel, setAddToIntel] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  function decide(status: 'verified' | 'rejected' | 'duplicate') {
    startTransition(async () => {
      const result = await moderateReportAction(report.id, status, { note: note.trim() || undefined, addToThreatIntel: status === 'verified' && addToIntel });
      if (result.ok) {
        toast.success(result.message ?? 'Report updated');
        router.refresh();
      } else {
        toast.error(result.message ?? 'Could not update the report');
      }
    });
  }

  return (
    <div className="rounded-xl border border-line bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs text-ink">{report.target}</p>
            <Badge variant={STATUS_VARIANT[report.status] ?? 'outline'}>{report.status}</Badge>
            <Badge variant="outline">{report.targetType}</Badge>
          </div>
          <p className="text-xs text-muted">
            {CATEGORY_LABELS[report.category] ?? report.category} · {report.reporterEmail ?? 'unknown reporter'} ·{' '}
            {formatDateTime(report.createdAt)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Hide details' : 'Review'}
        </Button>
      </div>

      <p className="mt-2 text-sm text-muted">{expanded ? report.description : truncate(report.description, 220)}</p>
      {report.verificationCount > 0 ? (
        <p className="mt-1 text-[11px] text-accent">{report.verificationCount} corroborating reports</p>
      ) : null}

      {expanded ? (
        <div className="mt-3 space-y-3 border-t border-line/70 pt-3">
          <div className="space-y-1">
            <Label htmlFor={`note-${report.id}`} className="text-xs">
              Moderator note (recorded in the audit log)
            </Label>
            <Textarea
              id={`note-${report.id}`}
              rows={2}
              className="min-h-[60px] text-xs"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What evidence did you check? Why is this verified or rejected?"
              maxLength={1000}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={addToIntel} onChange={(event) => setAddToIntel(event.target.checked)} className="h-3.5 w-3.5" />
            On verify, promote the target domain into the threat registry
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" loading={pending} disabled={report.status === 'verified'} onClick={() => decide('verified')}>
              <Check className="h-3.5 w-3.5" aria-hidden /> Verify
            </Button>
            <Button size="sm" variant="danger" loading={pending} disabled={report.status === 'rejected'} onClick={() => decide('rejected')}>
              <X className="h-3.5 w-3.5" aria-hidden /> Reject
            </Button>
            <Button size="sm" variant="outline" loading={pending} disabled={report.status === 'duplicate'} onClick={() => decide('duplicate')}>
              Mark duplicate
            </Button>
          </div>
          <FieldHint>Verification without a threat-registry promotion leaves the domain out of scan results.</FieldHint>
        </div>
      ) : null}
    </div>
  );
}

export function UserRowActions({
  user,
  actorId,
}: {
  user: { id: string; roles: string[]; suspended: boolean; email: string };
  actorId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isSelf = user.id === actorId;
  const isAdmin = user.roles.includes('admin');

  function update(input: { roles?: string[]; suspended?: boolean }) {
    startTransition(async () => {
      const result = await adminUpdateUserAction(user.id, input);
      if (result.ok) {
        toast.success(result.message ?? 'User updated');
        router.refresh();
      } else {
        toast.error(result.message ?? 'Could not update the user');
      }
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        disabled={isSelf}
        onClick={() => update({ roles: isAdmin ? ['user'] : ['user', 'admin'] })}
      >
        {isAdmin ? <ShieldOff className="h-3.5 w-3.5" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
        {isAdmin ? 'Revoke admin' : 'Make admin'}
      </Button>
      <Button
        size="sm"
        variant={user.suspended ? 'outline' : 'danger'}
        loading={pending}
        disabled={isSelf}
        onClick={() => update({ suspended: !user.suspended })}
      >
        {user.suspended ? 'Unsuspend' : 'Suspend'}
      </Button>
    </div>
  );
}

export function ThreatCreateForm() {
  const router = useRouter();
  const [domain, setDomain] = useState('');
  const [category, setCategory] = useState('phishing');
  const [riskLevel, setRiskLevel] = useState<'moderate' | 'high' | 'critical'>('high');
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="threat-domain">Domain</Label>
          <Input id="threat-domain" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="scam-domain.example" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="threat-category">Category</Label>
          <select
            id="threat-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
          >
            {Object.entries(CATEGORY_LABELS)
              .filter(([key]) => key !== 'unknown')
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="threat-risk">Risk level</Label>
          <select
            id="threat-risk"
            value={riskLevel}
            onChange={(event) => setRiskLevel(event.target.value as typeof riskLevel)}
            className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
          >
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="threat-note">Reason / source</Label>
          <Input id="threat-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Verified phishing kit, ticket #…" maxLength={500} />
        </div>
      </div>
      <Button
        loading={pending}
        disabled={domain.trim().length < 3}
        onClick={() =>
          startTransition(async () => {
            const result = await adminCreateThreatAction({ domain: domain.trim(), category, riskLevel, note: note.trim() || undefined });
            if (result.ok) {
              toast.success(result.message ?? 'Threat added');
              setDomain('');
              setNote('');
              router.refresh();
            } else {
              toast.error(result.message ?? 'Could not add the domain');
            }
          })
        }
      >
        <Globe2 className="h-4 w-4" aria-hidden /> Add verified domain
      </Button>
      <FieldHint>Only add domains you have independently verified. This immediately affects scan results.</FieldHint>
    </div>
  );
}
