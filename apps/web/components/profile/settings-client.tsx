'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Download, KeyRound, Laptop, ShieldCheck, Trash2 } from 'lucide-react';
import type { ActivityEventDto, SessionDto, UserProfile } from '@scamshield/shared-types';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldError,
  FieldHint,
  Input,
  Label,
  Separator,
  Switch,
} from '@/components/ui/primitives';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/interactive';
import {
  changePasswordAction,
  deleteAccountAction,
  disableMfaAction,
  enableMfaAction,
  revokeSessionAction,
  setupMfaAction,
  updateProfileAction,
} from '@/lib/actions';
import { formatDateTime, relativeTime } from '@/lib/utils';

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-white/[0.02] p-3">
      <div className="space-y-0.5">
        <p className="text-sm text-ink">{label}</p>
        <p className="text-[11px] leading-relaxed text-muted">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

export function SettingsClient({
  profile,
  sessions,
  activity,
}: {
  profile: UserProfile;
  sessions: SessionDto[];
  activity: ActivityEventDto[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState('preferences');
  const [pending, startTransition] = useTransition();

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [notifications, setNotifications] = useState(profile.notificationPreferences);
  const [privacy, setPrivacy] = useState(profile.privacyPreferences);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [disablePassword, setDisablePassword] = useState('');

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function savePreferences() {
    startTransition(async () => {
      const result = await updateProfileAction({
        displayName: displayName.trim(),
        notificationPreferences: notifications,
        privacyPreferences: privacy,
      });
      if (result.ok) toast.success(result.message ?? 'Preferences saved');
      else toast.error(result.message ?? 'Could not save preferences');
    });
  }

  function submitPassword() {
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    startTransition(async () => {
      const result = await changePasswordAction(currentPassword, newPassword);
      if (result.ok) {
        toast.success(result.message ?? 'Password changed');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError(result.message ?? 'Could not change the password');
      }
    });
  }

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid-cols-2 sm:grid-cols-4">
        <TabsTrigger value="preferences">Preferences</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
        <TabsTrigger value="sessions">Sessions & activity</TabsTrigger>
        <TabsTrigger value="data">Data & deletion</TabsTrigger>
      </TabsList>

      <TabsContent value="preferences" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>This name appears on your dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5 sm:max-w-sm">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} />
            </div>
            <div className="space-y-1.5 sm:max-w-sm">
              <Label htmlFor="accountEmail">Email</Label>
              <Input id="accountEmail" value={profile.email} readOnly disabled />
              <FieldHint>Email changes are not enabled in this deployment.</FieldHint>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>In-app alerts are always recorded; email delivery requires SMTP to be configured.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(
              [
                ['suspiciousScanAlerts', 'High-risk scan alerts', 'Tell me when a scan is rated high or critical.'],
                ['emailAlerts', 'Email delivery', 'Send eligible alerts by email. Submitted content is never included.'],
                ['reportStatusAlerts', 'Community report updates', 'Tell me when a report is verified or rejected.'],
                ['securityAlerts', 'Account security alerts', 'Sign-in locks, password changes and MFA changes.'],
                ['productUpdates', 'Product updates', 'Occasional changes to features. Off by default.'],
              ] as const
            ).map(([key, label, description]) => (
              <ToggleRow
                key={key}
                label={label}
                description={description}
                checked={notifications[key]}
                onChange={(value) => setNotifications((previous) => ({ ...previous, [key]: value }))}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy and retention</CardTitle>
            <CardDescription>Applies to future scans. Existing scans keep the retention they were created with.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ToggleRow
              label="Store scan content by default"
              description="Pre-selects the consent switch on the scanner. Full content is encrypted and deleted on your retention schedule."
              checked={privacy.storeScanContent}
              onChange={(value) => setPrivacy((previous) => ({ ...previous, storeScanContent: value }))}
            />
            <ToggleRow
              label="Allow community report moderation"
              description="Lets moderators contact you about reports you submit. Your identity is never shown publicly."
              checked={privacy.allowCommunityReports}
              onChange={(value) => setPrivacy((previous) => ({ ...previous, allowCommunityReports: value }))}
            />
            <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-white/[0.02] p-3">
              <div>
                <p className="text-sm text-ink">Content retention</p>
                <p className="text-[11px] text-muted">How long consented content is kept before automatic deletion.</p>
              </div>
              <select
                value={privacy.retentionDays}
                onChange={(event) => setPrivacy((previous) => ({ ...previous, retentionDays: Number(event.target.value) }))}
                className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
                aria-label="Content retention days"
              >
                {[7, 30, 90, 180, 365].map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={savePreferences} loading={pending}>
            Save preferences
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="security" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-accent" aria-hidden /> Change password
            </CardTitle>
            <CardDescription>Changing your password signs out every other session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5 sm:max-w-sm">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:max-w-lg sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
            </div>
            <FieldHint>At least 12 characters with upper case, lower case and a number.</FieldHint>
            <FieldError>{passwordError}</FieldError>
            <Button onClick={submitPassword} loading={pending} disabled={!currentPassword || !newPassword}>
              Update password
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" aria-hidden /> Multi-factor authentication
            </CardTitle>
            <CardDescription>
              TOTP codes from Google Authenticator, Authy, 1Password or a similar app, plus one-time recovery codes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.mfaEnabled ? (
              <>
                <Alert variant="success" title="MFA is enabled">
                  Sign-in requires a rotating 6-digit code. Recovery codes can be used once each.
                </Alert>
                <div className="space-y-1.5 sm:max-w-sm">
                  <Label htmlFor="disablePassword">Password to disable MFA</Label>
                  <Input
                    id="disablePassword"
                    type="password"
                    value={disablePassword}
                    onChange={(event) => setDisablePassword(event.target.value)}
                  />
                </div>
                <Button
                  variant="danger"
                  loading={pending}
                  disabled={!disablePassword}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await disableMfaAction(disablePassword);
                      if (result.ok) {
                        toast.success('MFA disabled');
                        setDisablePassword('');
                        router.refresh();
                      } else {
                        toast.error(result.message ?? 'Could not disable MFA');
                      }
                    })
                  }
                >
                  Disable MFA
                </Button>
              </>
            ) : mfaSetup ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Add this secret to your authenticator app, then enter the current 6-digit code to confirm.
                </p>
                <div className="rounded-xl border border-line bg-canvas/50 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted">Secret</p>
                  <p className="break-all font-mono text-sm text-ink">{mfaSetup.secret}</p>
                </div>
                <p className="break-all text-[11px] text-muted">OTPAUTH URI: {mfaSetup.otpauthUri}</p>
                <div className="space-y-1.5 sm:max-w-[220px]">
                  <Label htmlFor="mfaCode">Verification code</Label>
                  <Input
                    id="mfaCode"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                  />
                </div>
                {mfaError ? <FieldError>{mfaError}</FieldError> : null}
                <Button
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setMfaError(null);
                      const result = await enableMfaAction(mfaCode);
                      if (result.ok && result.data) {
                        setRecoveryCodes(result.data.recoveryCodes);
                        setMfaSetup(null);
                        toast.success('MFA enabled');
                        router.refresh();
                      } else {
                        setMfaError(result.message ?? 'Could not enable MFA');
                      }
                    })
                  }
                >
                  Enable MFA
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    setMfaError(null);
                    const result = await setupMfaAction();
                    if (result.ok && result.data) setMfaSetup(result.data);
                    else setMfaError(result.message ?? 'Could not start MFA setup');
                  })
                }
              >
                Start MFA setup
              </Button>
            )}
            {recoveryCodes ? (
              <div className="space-y-2 rounded-xl border border-warning/30 bg-warning/5 p-3">
                <p className="text-sm font-medium text-ink">Save your recovery codes now</p>
                <p className="text-xs text-muted">They are shown once and each works a single time.</p>
                <div className="grid grid-cols-2 gap-1 font-mono text-xs text-ink sm:grid-cols-5">
                  {recoveryCodes.map((code) => (
                    <span key={code} className="rounded border border-line bg-canvas/50 px-1.5 py-1">
                      {code}
                    </span>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(recoveryCodes.join('\n'));
                    toast.success('Recovery codes copied');
                  }}
                >
                  Copy codes
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sessions" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Laptop className="h-4 w-4 text-accent" aria-hidden /> Active sessions
            </CardTitle>
            <CardDescription>Revoke anything you do not recognise.</CardDescription>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted">No active sessions found.</p>
            ) : (
              <ul className="divide-y divide-line/70">
                {sessions.map((session) => (
                  <li key={session.id} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-ink">{session.current ? 'This device' : 'Signed-in device'}</p>
                        {session.current ? <Badge variant="success">Current</Badge> : null}
                      </div>
                      <p className="text-xs text-muted">
                        {session.ipAddress ?? 'IP unavailable'} · last active {relativeTime(session.lastUsedAt)} · expires{' '}
                        {formatDateTime(session.expiresAt)}
                      </p>
                      <p className="max-w-lg truncate text-[11px] text-muted/70">{session.userAgent ?? 'Unknown client'}</p>
                    </div>
                    {!session.current ? (
                      <Button
                        variant="outline"
                        size="sm"
                        loading={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await revokeSessionAction(session.id);
                            if (result.ok) {
                              toast.success('Session revoked');
                              router.refresh();
                            } else {
                              toast.error(result.message ?? 'Could not revoke session');
                            }
                          })
                        }
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent account activity</CardTitle>
            <CardDescription>Authentication and security events recorded in the audit log.</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted">No activity recorded yet.</p>
            ) : (
              <ul className="divide-y divide-line/70">
                {activity.slice(0, 20).map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                    <div>
                      <p className="text-ink/90">{event.action}</p>
                      <p className="text-muted">
                        {event.resource} · {event.ipAddress ?? 'IP unavailable'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted">{formatDateTime(event.createdAt)}</p>
                      <p className={event.outcome === 'success' ? 'text-success' : 'text-danger'}>{event.outcome}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="data" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-4 w-4 text-accent" aria-hidden /> Export your data
            </CardTitle>
            <CardDescription>
              A JSON file with your profile, scans, findings, reports and feedback. Full content is included only where you
              consented to storage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href="/account/export" download>
                Download export
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-danger/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-danger">
              <Trash2 className="h-4 w-4" aria-hidden /> Delete account
            </CardTitle>
            <CardDescription>
              Permanently removes your profile, sessions, scans, scans’ findings and notifications. Community reports remain
              for moderation but are detached from your identity. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:max-w-lg sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="deletePassword">Password</Label>
                <Input
                  id="deletePassword"
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deleteConfirm">Type DELETE</Label>
                <Input
                  id="deleteConfirm"
                  value={deleteConfirm}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                  placeholder="DELETE"
                />
              </div>
            </div>
            <FieldError>{deleteError}</FieldError>
            <Alert variant="warning" title="Before deleting">
              <p>
                Download your export first if you may need it. If you have lost money to a scam, keep your bank and police
                complaint references outside this account.
              </p>
            </Alert>
            <Button
              variant="danger"
              loading={pending}
              disabled={!deletePassword || deleteConfirm !== 'DELETE'}
              onClick={() => {
                if (!window.confirm('Delete your account and all personal data permanently?')) return;
                startTransition(async () => {
                  setDeleteError(null);
                  const result = await deleteAccountAction(deletePassword, deleteConfirm);
                  if (result.ok) {
                    toast.success('Account deleted');
                    router.push('/');
                    router.refresh();
                  } else {
                    setDeleteError(result.message ?? 'Could not delete the account');
                  }
                });
              }}
            >
              <AlertTriangle className="h-4 w-4" aria-hidden /> Delete my account
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
