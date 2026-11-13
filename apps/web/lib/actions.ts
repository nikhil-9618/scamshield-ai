'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ApiErrorBody, AiExplanation, ScanDetail, ScanFeedbackDto } from '@scamshield/shared-types';
import {
  communityReportSchema,
  emailScanSchema,
  loginSchema,
  messageScanSchema,
  profileUpdateSchema,
  registerSchema,
  resetPasswordSchema,
  scamCategorySchema,
  urlScanSchema,
  type CommunityReportInput,
  type LoginInput,
  type MessageScanInput,
  type ProfileUpdateInput,
  type RegisterInput,
  type UrlScanInput,
} from '@scamshield/validation';
import { z } from 'zod';
import { apiFetch } from './api';

export interface ActionResult<T = undefined> {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
}

function fail(error: ApiErrorBody): ActionResult<never> {
  return { ok: false, message: error.message, fieldErrors: error.details ?? undefined };
}

function validate<T>(schema: z.ZodSchema<T>, value: unknown): { ok: true; value: T } | { ok: false; result: ActionResult<never> } {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.') || 'form';
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return { ok: false, result: { ok: false, message: 'Please check the highlighted fields.', fieldErrors } };
}

/* --------------------------------------------------------------------- auth */

export async function loginAction(input: LoginInput & { next?: string }): Promise<ActionResult> {
  const checked = validate(loginSchema, input);
  if (!checked.ok) return checked.result;
  const result = await apiFetch<{ user: { emailVerified: boolean } }>('/auth/login', {
    method: 'POST',
    json: checked.value,
    persistCookies: true,
  });
  if (!result.ok) return fail(result.error);
  const next = input.next && input.next.startsWith('/') ? input.next : '/dashboard';
  revalidatePath('/', 'layout');
  redirect(next);
}

export async function registerAction(input: RegisterInput): Promise<ActionResult> {
  const checked = validate(registerSchema, input);
  if (!checked.ok) return checked.result;
  const result = await apiFetch('/auth/register', { method: 'POST', json: checked.value, persistCookies: true });
  if (!result.ok) return fail(result.error);
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST', persistCookies: true });
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function forgotPasswordAction(email: string): Promise<ActionResult<{ devToken?: string }>> {
  const result = await apiFetch<{ message: string; devToken?: string }>('/auth/forgot-password', {
    method: 'POST',
    json: { email },
  });
  if (!result.ok) return fail(result.error);
  return { ok: true, message: result.data.message, data: { devToken: result.data.devToken } };
}

export async function resetPasswordAction(token: string, password: string): Promise<ActionResult> {
  const checked = validate(resetPasswordSchema, { token, password });
  if (!checked.ok) return checked.result;
  const result = await apiFetch('/auth/reset-password', { method: 'POST', json: checked.value });
  if (!result.ok) return fail(result.error);
  return { ok: true, message: 'Password updated. Sign in with your new password.' };
}

export async function verifyEmailAction(token: string): Promise<ActionResult> {
  const result = await apiFetch('/auth/verify-email', { method: 'POST', json: { token } });
  if (!result.ok) return fail(result.error);
  revalidatePath('/dashboard');
  return { ok: true, message: 'Email verified.' };
}

export async function resendVerificationAction(): Promise<ActionResult> {
  const result = await apiFetch('/auth/resend-verification', { method: 'POST' });
  if (!result.ok) return fail(result.error);
  return { ok: true, message: 'If your email is not verified yet, a new link has been sent.' };
}

/* -------------------------------------------------------------------- scans */

export async function scanMessageAction(input: MessageScanInput): Promise<ActionResult<ScanDetail>> {
  const checked = validate(messageScanSchema, input);
  if (!checked.ok) return checked.result;
  const result = await apiFetch<ScanDetail>('/scans/message', { method: 'POST', json: checked.value });
  if (!result.ok) return fail(result.error);
  revalidatePath('/dashboard');
  revalidatePath('/scans');
  return { ok: true, data: result.data };
}

export async function scanUrlAction(input: UrlScanInput): Promise<ActionResult<ScanDetail>> {
  const checked = validate(urlScanSchema, input);
  if (!checked.ok) return checked.result;
  const result = await apiFetch<ScanDetail>('/scans/url', { method: 'POST', json: checked.value });
  if (!result.ok) return fail(result.error);
  revalidatePath('/dashboard');
  revalidatePath('/scans');
  return { ok: true, data: result.data };
}

export async function scanEmailAction(input: { raw: string; consentToStore: boolean }): Promise<ActionResult<ScanDetail>> {
  const checked = validate(emailScanSchema, input);
  if (!checked.ok) return checked.result;
  const result = await apiFetch<ScanDetail>('/scans/email', { method: 'POST', json: checked.value });
  if (!result.ok) return fail(result.error);
  revalidatePath('/dashboard');
  revalidatePath('/scans');
  return { ok: true, data: result.data };
}

export async function scanUploadAction(
  type: 'screenshot' | 'qr' | 'email',
  formData: FormData,
): Promise<ActionResult<ScanDetail>> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose a file to scan.' };
  }
  const maxBytes = type === 'email' ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    return { ok: false, message: `That file is too large. Maximum ${Math.round(maxBytes / (1024 * 1024))} MB.` };
  }
  const forward = new FormData();
  forward.append('file', file, file.name);
  forward.append('consentToStore', String(formData.get('consentToStore') === 'true'));
  const result = await apiFetch<ScanDetail>(`/scans/${type}`, { method: 'POST', formData: forward, timeoutMs: 120_000 });
  if (!result.ok) return fail(result.error);
  revalidatePath('/dashboard');
  revalidatePath('/scans');
  return { ok: true, data: result.data };
}

export async function explainScanAction(scanId: string): Promise<ActionResult<AiExplanation>> {
  const result = await apiFetch<{ explanation: AiExplanation }>(`/scans/${scanId}/explain`, { method: 'POST' });
  if (!result.ok) return fail(result.error);
  revalidatePath(`/scans/${scanId}`);
  return { ok: true, data: result.data.explanation };
}

export async function deleteScanAction(scanId: string): Promise<ActionResult> {
  const result = await apiFetch(`/scans/${scanId}`, { method: 'DELETE' });
  if (!result.ok) return fail(result.error);
  revalidatePath('/scans');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function clearHistoryAction(): Promise<ActionResult> {
  const result = await apiFetch('/scans', { method: 'DELETE' });
  if (!result.ok) return fail(result.error);
  revalidatePath('/scans');
  revalidatePath('/dashboard');
  return { ok: true, message: 'Scan history cleared.' };
}

export async function submitFeedbackAction(
  scanId: string,
  verdict: 'correct' | 'incorrect' | 'unsure',
  comment?: string,
): Promise<ActionResult<ScanFeedbackDto>> {
  const result = await apiFetch<ScanFeedbackDto>(`/scans/${scanId}/feedback`, {
    method: 'POST',
    json: { verdict, comment },
  });
  if (!result.ok) return fail(result.error);
  revalidatePath(`/scans/${scanId}`);
  return { ok: true, data: result.data };
}

/* ------------------------------------------------------------------ profile */

export async function updateProfileAction(input: ProfileUpdateInput): Promise<ActionResult> {
  const checked = validate(profileUpdateSchema, input);
  if (!checked.ok) return checked.result;
  const result = await apiFetch('/users/me', { method: 'PATCH', json: checked.value });
  if (!result.ok) return fail(result.error);
  revalidatePath('/profile');
  return { ok: true, message: 'Settings saved.' };
}

export async function revokeSessionAction(sessionId: string): Promise<ActionResult> {
  const result = await apiFetch(`/users/me/sessions/${sessionId}`, { method: 'DELETE' });
  if (!result.ok) return fail(result.error);
  revalidatePath('/profile');
  return { ok: true, message: 'Session signed out.' };
}

export async function deleteAccountAction(password: string, confirm: string): Promise<ActionResult> {
  const result = await apiFetch('/users/me', { method: 'DELETE', json: { password, confirm } });
  if (!result.ok) return fail(result.error);
  return { ok: true, message: 'Account deleted.' };
}

export async function changePasswordAction(currentPassword: string, newPassword: string): Promise<ActionResult> {
  const result = await apiFetch('/auth/change-password', {
    method: 'POST',
    json: { currentPassword, newPassword },
  });
  if (!result.ok) return fail(result.error);
  return { ok: true, message: 'Password changed. Other sessions were signed out.' };
}

export async function setupMfaAction(): Promise<ActionResult<{ secret: string; otpauthUri: string }>> {
  const result = await apiFetch<{ secret: string; otpauthUri: string }>('/auth/mfa/setup', { method: 'POST' });
  if (!result.ok) return fail(result.error);
  return { ok: true, data: result.data };
}

export async function enableMfaAction(code: string): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  const result = await apiFetch<{ recoveryCodes: string[] }>('/auth/mfa/enable', { method: 'POST', json: { code } });
  if (!result.ok) return fail(result.error);
  revalidatePath('/profile');
  return { ok: true, data: result.data };
}

export async function disableMfaAction(password: string): Promise<ActionResult> {
  const result = await apiFetch('/auth/mfa/disable', { method: 'POST', json: { password } });
  if (!result.ok) return fail(result.error);
  revalidatePath('/profile');
  return { ok: true, message: 'Multi-factor authentication disabled.' };
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const result = await apiFetch('/notifications/read-all', { method: 'POST' });
  if (!result.ok) return fail(result.error);
  revalidatePath('/notifications');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  const result = await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
  if (!result.ok) return fail(result.error);
  revalidatePath('/notifications');
  return { ok: true };
}

/* ------------------------------------------------------------------ reports */

const reportActionSchema = communityReportSchema;

export async function submitReportAction(input: CommunityReportInput): Promise<ActionResult> {
  const checked = validate(reportActionSchema, input);
  if (!checked.ok) return checked.result;
  const result = await apiFetch('/reports', { method: 'POST', json: checked.value });
  if (!result.ok) return fail(result.error);
  revalidatePath('/reports');
  return { ok: true, message: 'Report submitted for moderation.' };
}

/* -------------------------------------------------------------------- admin */

export async function moderateReportAction(
  id: string,
  status: 'verified' | 'rejected' | 'duplicate',
  options: { note?: string; duplicateOfId?: string; addToThreatIntel?: boolean } = {},
): Promise<ActionResult> {
  const result = await apiFetch(`/admin/reports/${id}`, {
    method: 'PATCH',
    json: {
      status,
      moderatorNote: options.note,
      duplicateOfId: options.duplicateOfId,
      addToThreatIntel: options.addToThreatIntel ?? false,
    },
  });
  if (!result.ok) return fail(result.error);
  revalidatePath('/admin/reports');
  revalidatePath('/admin');
  return { ok: true, message: `Report marked ${status}.` };
}

export async function adminUpdateUserAction(
  id: string,
  input: { roles?: string[]; suspended?: boolean },
): Promise<ActionResult> {
  const result = await apiFetch(`/admin/users/${id}`, { method: 'PATCH', json: input });
  if (!result.ok) return fail(result.error);
  revalidatePath('/admin/users');
  return { ok: true, message: 'User updated.' };
}

export async function adminCreateThreatAction(input: {
  domain: string;
  category: string;
  riskLevel: 'moderate' | 'high' | 'critical';
  note?: string;
}): Promise<ActionResult> {
  const schema = z.object({
    domain: z.string().trim().min(3).max(300),
    category: scamCategorySchema,
    riskLevel: z.enum(['moderate', 'high', 'critical']),
    note: z.string().trim().max(500).optional(),
  });
  const checked = validate(schema, input);
  if (!checked.ok) return checked.result;
  const result = await apiFetch('/admin/threats', { method: 'POST', json: checked.value });
  if (!result.ok) return fail(result.error);
  revalidatePath('/admin/threats');
  return { ok: true, message: 'Threat domain added.' };
}

export async function testNotificationAction(title: string, message: string): Promise<ActionResult> {
  const result = await apiFetch('/notifications/test', { method: 'POST', json: { title, message } });
  if (!result.ok) return fail(result.error);
  revalidatePath('/notifications');
  return { ok: true, message: 'Test notification queued.' };
}

