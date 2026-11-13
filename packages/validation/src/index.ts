import { z } from 'zod';

/** Central limits so the browser and the API enforce identical rules. */
export const LIMITS = {
  messageMin: 10,
  messageMax: 20_000,
  emailRawMax: 60_000,
  emlMaxBytes: 2 * 1024 * 1024,
  imageMaxBytes: 5 * 1024 * 1024,
  descriptionMin: 30,
  descriptionMax: 4_000,
  passwordMin: 12,
  passwordMax: 128,
} as const;

export const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg'] as const;
export const ALLOWED_EML_MIME_TYPES = ['message/rfc822', 'text/plain', 'application/octet-stream'] as const;

const COMMON_PASSWORDS = new Set([
  'password1234',
  'password12345',
  'qwertyuiop12',
  '123456789012',
  'letmein12345',
  'adminadmin12',
]);

export const emailSchema = z
  .string()
  .trim()
  .min(3, 'Enter an email address')
  .max(254, 'Email address is too long')
  .email('Enter a valid email address')
  .transform((value) => value.toLowerCase());

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < LIMITS.passwordMin) issues.push(`Use at least ${LIMITS.passwordMin} characters`);
  if (password.length > LIMITS.passwordMax) issues.push(`Use at most ${LIMITS.passwordMax} characters`);
  if (!/[a-z]/.test(password)) issues.push('Include a lowercase letter');
  if (!/[A-Z]/.test(password)) issues.push('Include an uppercase letter');
  if (!/[0-9]/.test(password)) issues.push('Include a number');
  if (COMMON_PASSWORDS.has(password.toLowerCase())) issues.push('This password is too common');
  return issues;
}

export const passwordSchema = z
  .string()
  .min(LIMITS.passwordMin, `Use at least ${LIMITS.passwordMin} characters`)
  .max(LIMITS.passwordMax, `Use at most ${LIMITS.passwordMax} characters`)
  .superRefine((value, ctx) => {
    const issues = passwordIssues(value);
    for (const issue of issues) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue });
    }
  });

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2, 'Enter your name').max(60, 'Name is too long'),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms to continue' }) }),
  marketingOptIn: z.boolean().optional().default(false),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(LIMITS.passwordMax),
  mfaCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code')
    .optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(20, 'Reset link is invalid').max(200),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(LIMITS.passwordMax),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export const mfaCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const channelSchema = z.enum(['sms', 'whatsapp', 'telegram', 'email', 'social', 'other']);

export const messageScanSchema = z.object({
  content: z
    .string()
    .trim()
    .min(LIMITS.messageMin, `Paste at least ${LIMITS.messageMin} characters`)
    .max(LIMITS.messageMax, `Message is longer than ${LIMITS.messageMax} characters`),
  channel: channelSchema.default('sms'),
  consentToStore: z.boolean().default(false),
});
export type MessageScanInput = z.infer<typeof messageScanSchema>;

export const urlScanSchema = z.object({
  url: z
    .string()
    .trim()
    .min(4, 'Enter a URL')
    .max(2048, 'URL is too long')
    .refine((value) => /^https?:\/\//i.test(value), 'URL must start with http:// or https://'),
  consentToStore: z.boolean().default(false),
});
export type UrlScanInput = z.infer<typeof urlScanSchema>;

export const emailScanSchema = z.object({
  raw: z
    .string()
    .min(20, 'Paste the email content')
    .max(LIMITS.emailRawMax, 'Email content is too long'),
  consentToStore: z.boolean().default(false),
});
export type EmailScanInput = z.infer<typeof emailScanSchema>;

export const feedbackSchema = z.object({
  verdict: z.enum(['correct', 'incorrect', 'unsure']),
  comment: z.string().trim().max(1_000).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const reportTargetTypeSchema = z.enum(['domain', 'url', 'phone', 'message', 'email']);
export const scamCategorySchema = z.enum([
  'fake_job',
  'phishing',
  'payment_fraud',
  'kyc_fraud',
  'upi_scam',
  'courier_scam',
  'fake_support',
  'qr_scam',
  'government_scheme',
  'impersonation',
  'investment_fraud',
  'lottery_prize',
  'unknown',
]);

export const communityReportSchema = z.object({
  targetType: reportTargetTypeSchema,
  target: z.string().trim().min(3, 'Enter the domain, number or email').max(300, 'Target is too long'),
  category: scamCategorySchema,
  description: z
    .string()
    .trim()
    .min(LIMITS.descriptionMin, `Describe what happened in at least ${LIMITS.descriptionMin} characters`)
    .max(LIMITS.descriptionMax, 'Description is too long'),
  evidenceUrls: z.array(urlScanSchema.shape.url).max(5).optional().default([]),
});
export type CommunityReportInput = z.infer<typeof communityReportSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export const scanListQuerySchema = paginationSchema.extend({
  type: z.enum(['message', 'url', 'screenshot', 'qr', 'email']).optional(),
  riskLevel: z.enum(['low', 'moderate', 'high', 'critical']).optional(),
  status: z.enum(['queued', 'processing', 'completed', 'failed']).optional(),
});
export type ScanListQueryInput = z.infer<typeof scanListQuerySchema>;

export const reportListQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'verified', 'rejected', 'duplicate']).optional(),
  category: scamCategorySchema.optional(),
});

export const notificationPreferencesSchema = z.object({
  emailAlerts: z.boolean().optional(),
  suspiciousScanAlerts: z.boolean().optional(),
  reportStatusAlerts: z.boolean().optional(),
  securityAlerts: z.boolean().optional(),
  productUpdates: z.boolean().optional(),
});

export const privacyPreferencesSchema = z.object({
  storeScanContent: z.boolean().optional(),
  allowCommunityReports: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(365).optional(),
});

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(60).optional(),
    notificationPreferences: notificationPreferencesSchema.optional(),
    privacyPreferences: privacyPreferencesSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(LIMITS.passwordMax),
  confirm: z.literal('DELETE', {
    errorMap: () => ({ message: 'Type DELETE to confirm' }),
  }),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export const adminReportUpdateSchema = z.object({
  status: z.enum(['verified', 'rejected', 'duplicate']),
  moderatorNote: z.string().trim().max(2_000).optional(),
  duplicateOfId: z.string().uuid().optional(),
  /** Promoting a verified domain report into the threat intelligence table. */
  addToThreatIntel: z.boolean().optional().default(false),
});
export type AdminReportUpdateInput = z.infer<typeof adminReportUpdateSchema>;

export const adminUserUpdateSchema = z.object({
  roles: z.array(z.enum(['user', 'moderator', 'admin'])).min(1).optional(),
  suspended: z.boolean().optional(),
});
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;

export const adminScanQuerySchema = scanListQuerySchema.extend({
  riskLevel: z.enum(['low', 'moderate', 'high', 'critical']).optional(),
});

/** Values used in the UI pricing section. Kept in sync with the seeded plans. */
export const PLAN_COPY = [
  {
    slug: 'free',
    name: 'Guardian Free',
    priceMonthlyInr: 0,
    dailyScanLimit: 10,
    highlights: ['All five scanners', 'Transparent findings', 'Email verification', '30-day history'],
  },
  {
    slug: 'plus',
    name: 'Guardian Plus',
    priceMonthlyInr: 249,
    dailyScanLimit: 100,
    highlights: ['Everything in Free', 'AI explanations on every scan', 'Saved reports', 'Priority scan queue'],
  },
  {
    slug: 'business',
    name: 'Small Business',
    priceMonthlyInr: 1499,
    dailyScanLimit: 1000,
    highlights: ['Everything in Plus', 'Team accounts', 'Community report moderation', 'Exportable audit trail'],
  },
] as const;
