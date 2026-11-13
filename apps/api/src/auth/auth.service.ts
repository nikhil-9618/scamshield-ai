import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Algorithm, hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { CookieOptions, Request } from 'express';
import type { LoginInput, RegisterInput } from '@scamshield/validation';
import type { NotificationPreferences, PrivacyPreferences, UserProfile } from '@scamshield/shared-types';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailService } from '../common/mail/mail.service';
import { loadEnv } from '../common/config/env';
import { ApiException } from '../common/http/api-exception';
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from '../common/utils/crypto.util';
import { generateRecoveryCodes, generateTotpSecret, otpauthUri, verifyTotp } from './totp';

const ARGON_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_MINUTES = 15;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailAlerts: true,
  suspiciousScanAlerts: true,
  reportStatusAlerts: true,
  securityAlerts: true,
  productUpdates: false,
};

export const DEFAULT_PRIVACY_PREFERENCES: PrivacyPreferences = {
  storeScanContent: false,
  allowCommunityReports: true,
  retentionDays: 30,
};

export function parseNotificationPreferences(raw: Prisma.JsonValue | null | undefined): NotificationPreferences {
  const value = (raw ?? {}) as Record<string, unknown>;
  const read = (key: keyof NotificationPreferences) =>
    typeof value[key] === 'boolean' ? (value[key] as boolean) : DEFAULT_NOTIFICATION_PREFERENCES[key];
  return {
    emailAlerts: read('emailAlerts'),
    suspiciousScanAlerts: read('suspiciousScanAlerts'),
    reportStatusAlerts: read('reportStatusAlerts'),
    securityAlerts: read('securityAlerts'),
    productUpdates: read('productUpdates'),
  };
}

export function parsePrivacyPreferences(raw: Prisma.JsonValue | null | undefined): PrivacyPreferences {
  const value = (raw ?? {}) as Record<string, unknown>;
  const retention = typeof value.retentionDays === 'number' ? value.retentionDays : DEFAULT_PRIVACY_PREFERENCES.retentionDays;
  return {
    storeScanContent:
      typeof value.storeScanContent === 'boolean' ? value.storeScanContent : DEFAULT_PRIVACY_PREFERENCES.storeScanContent,
    allowCommunityReports:
      typeof value.allowCommunityReports === 'boolean'
        ? value.allowCommunityReports
        : DEFAULT_PRIVACY_PREFERENCES.allowCommunityReports,
    retentionDays: Math.min(365, Math.max(1, Math.trunc(retention))),
  };
}

export const profileInclude = {
  roles: { include: { role: true } },
  subscriptions: {
    where: { status: 'active' as const },
    include: { plan: true },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
} satisfies Prisma.UserInclude;

export type UserWithProfile = Prisma.UserGetPayload<{ include: typeof profileInclude }>;

export interface IssuedSession {
  token: string;
  csrfToken: string;
  sessionId: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);
  private readonly env = loadEnv();
  private dummyHashPromise: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureBootstrapAdmin();
  }

  /**
   * Creates the first administrator from environment variables. This exists for
   * platforms without shell access (for example Render's free plan). It only
   * runs when no admin exists, so it never overwrites a changed password.
   */
  private async ensureBootstrapAdmin(): Promise<void> {
    const email = this.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
    const password = this.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!email || !password) return;
    if (password.length < 12) {
      this.logger.error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters; admin bootstrap skipped.');
      return;
    }

    const adminCount = await this.prisma.userRole.count({
      where: { role: { name: 'admin' }, user: { deletedAt: null } },
    });
    if (adminCount > 0) return;

    const role = await this.prisma.role.upsert({
      where: { name: 'admin' },
      update: {},
      create: {
        name: 'admin',
        description: 'Full platform administration.',
        permissions: [
          'scan:create',
          'scan:read:own',
          'scan:read:all',
          'report:create',
          'report:moderate',
          'threat:manage',
          'user:manage',
          'system:read',
          'audit:read',
        ],
      },
    });

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      await this.prisma.userRole.upsert({
        where: { userId_roleId: { userId: existing.id, roleId: role.id } },
        update: {},
        create: { userId: existing.id, roleId: role.id },
      });
      if (!existing.emailVerifiedAt) {
        await this.prisma.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } });
      }
      this.logger.warn(`Bootstrap admin role granted to existing account ${email}. Remove BOOTSTRAP_ADMIN_PASSWORD now.`);
      return;
    }

    const passwordHash = await argonHash(password, ARGON_OPTIONS);
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName: 'Administrator',
          emailVerifiedAt: new Date(),
        },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const plan = await tx.subscriptionPlan.findUnique({ where: { slug: 'free' } });
      if (plan) {
        await tx.userSubscription.create({ data: { userId: user.id, planId: plan.id, status: 'active' } });
      }
      return user;
    });

    await this.audit.record({
      actorId: created.id,
      actorRole: 'admin',
      action: 'admin.bootstrap',
      resourceType: 'user',
      resourceId: created.id,
      outcome: 'success',
      metadata: { email },
    });
    this.logger.warn(`Bootstrap administrator created for ${email}. Sign in, enable MFA, then remove BOOTSTRAP_ADMIN_PASSWORD.`);
  }

  // ---------------------------------------------------------------- registration

  async register(input: RegisterInput, request: Request): Promise<{ profile: UserProfile; session: IssuedSession }> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw ApiException.conflict('An account with this email already exists. Try signing in instead.');
    }

    const passwordHash = await argonHash(input.password, ARGON_OPTIONS);
    const userRole = await this.prisma.role.findUnique({ where: { name: 'user' } });
    if (!userRole) throw ApiException.unavailable('Account roles are not initialised yet. Please retry shortly.');
    const freePlan = await this.prisma.subscriptionPlan.findUnique({ where: { slug: 'free' } });

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          notificationPreferences: {
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            productUpdates: input.marketingOptIn ?? false,
          } as unknown as Prisma.InputJsonValue,
          privacyPreferences: DEFAULT_PRIVACY_PREFERENCES as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: userRole.id } });
      if (freePlan) {
        await tx.userSubscription.create({ data: { userId: user.id, planId: freePlan.id, status: 'active' } });
      }
      return user;
    });

    await this.issueEmailVerification(created.id, created.email);
    const session = await this.createSession(created.id, request);
    await this.audit.record({
      actorId: created.id,
      actorRole: 'user',
      action: 'auth.register',
      resourceType: 'user',
      resourceId: created.id,
      outcome: 'success',
      request,
    });

    const profile = await this.getProfile(created.id);
    return { profile, session };
  }

  // ----------------------------------------------------------------------- login

  async login(input: LoginInput, request: Request): Promise<{ profile: UserProfile; session: IssuedSession }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { roles: { include: { role: true } } },
    });

    if (!user || user.deletedAt) {
      await this.verifyDummyPassword(input.password);
      await this.audit.record({
        action: 'auth.login',
        resourceType: 'user',
        outcome: 'failure',
        request,
        metadata: { reason: 'unknown_account' },
      });
      throw ApiException.unauthorized('Email or password is incorrect', 'INVALID_CREDENTIALS');
    }

    if (user.suspendedAt) {
      throw new ApiException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'This account is suspended. Contact support if you believe this is a mistake.',
        status: 403,
      });
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const retryAfter = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      throw new ApiException({
        code: 'ACCOUNT_LOCKED',
        message: 'Too many failed attempts. Try again later or reset your password.',
        status: 423,
        retryAfterSeconds: retryAfter,
      });
    }

    const passwordOk = await this.verifyPassword(user.passwordHash, input.password);
    if (!passwordOk) {
      await this.registerFailedLogin(user.id, request, 'bad_password');
      throw ApiException.unauthorized('Email or password is incorrect', 'INVALID_CREDENTIALS');
    }

    if (user.mfaEnabled) {
      if (!input.mfaCode) {
        throw new ApiException({
          code: 'MFA_REQUIRED',
          message: 'Enter the 6-digit code from your authenticator app.',
          status: 401,
        });
      }
      const valid = await this.consumeMfaCode(user.id, user.mfaSecretEncrypted, user.mfaRecoveryCodeHashes, input.mfaCode);
      if (!valid) {
        await this.registerFailedLogin(user.id, request, 'bad_mfa');
        throw new ApiException({
          code: 'MFA_INVALID',
          message: 'That verification code is not valid. Codes rotate every 30 seconds.',
          status: 401,
        });
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const session = await this.createSession(user.id, request);
    await this.audit.record({
      actorId: user.id,
      actorRole: user.roles[0]?.role.name ?? 'user',
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
      outcome: 'success',
      request,
    });

    const profile = await this.getProfile(user.id);
    return { profile, session };
  }

  async logout(sessionId: string, request: Request): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'user_logout' },
    });
    await this.audit.record({
      action: 'auth.logout',
      resourceType: 'session',
      resourceId: sessionId,
      outcome: 'success',
      request,
    });
  }

  async logoutAll(userId: string, request: Request): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'user_logout_all' },
    });
    await this.audit.record({
      actorId: userId,
      action: 'auth.logout_all',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      request,
      metadata: { revoked: result.count },
    });
    return result.count;
  }

  // -------------------------------------------------------------------- sessions

  async createSession(userId: string, request: Request): Promise<IssuedSession> {
    const token = randomToken(32);
    const csrfToken = randomToken(32);
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_HOURS * 3600 * 1000);
    const forwarded = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();
    const session = await this.prisma.userSession.create({
      data: {
        userId,
        tokenHash: sha256Hex(token),
        csrfHash: sha256Hex(csrfToken),
        ipAddress: (request.ip ?? forwardedIp ?? null)?.slice(0, 64) ?? null,
        userAgent: request.headers['user-agent']?.slice(0, 255) ?? null,
        expiresAt,
      },
    });
    return { token, csrfToken, sessionId: session.id, expiresAt };
  }

  sessionCookieOptions(expiresAt: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      domain: this.env.COOKIE_DOMAIN,
    };
  }

  // --------------------------------------------------------------- email lifecycle

  async issueEmailVerification(userId: string, email: string): Promise<void> {
    const token = randomToken(32);
    await this.prisma.$transaction([
      this.prisma.authToken.deleteMany({ where: { userId, purpose: 'email_verification' } }),
      this.prisma.authToken.create({
        data: {
          userId,
          purpose: 'email_verification',
          tokenHash: sha256Hex(token),
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        },
      }),
    ]);
    await this.mail.sendVerification(email, `${this.env.APP_ORIGIN}/verify-email?token=${token}`);
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiException.notFound('Account not found');
    if (user.emailVerifiedAt) return;
    await this.issueEmailVerification(user.id, user.email);
  }

  async verifyEmail(token: string, request: Request): Promise<void> {
    const record = await this.prisma.authToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
    if (
      !record ||
      record.purpose !== 'email_verification' ||
      record.usedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw ApiException.badRequest('This verification link is invalid or has expired.');
    }
    await this.prisma.$transaction([
      this.prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    ]);
    await this.audit.record({
      actorId: record.userId,
      action: 'auth.email_verified',
      resourceType: 'user',
      resourceId: record.userId,
      outcome: 'success',
      request,
    });
  }

  async forgotPassword(email: string): Promise<{ devToken?: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always identical behaviour to avoid account enumeration.
    if (!user || user.deletedAt) return {};
    const token = randomToken(32);
    await this.prisma.$transaction([
      this.prisma.authToken.deleteMany({ where: { userId: user.id, purpose: 'password_reset' } }),
      this.prisma.authToken.create({
        data: {
          userId: user.id,
          purpose: 'password_reset',
          tokenHash: sha256Hex(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      }),
    ]);
    await this.mail.sendPasswordReset(user.email, `${this.env.APP_ORIGIN}/reset-password?token=${token}`);
    // Development-only helper so the flow is testable without SMTP. Never in production.
    return this.env.NODE_ENV === 'production' ? {} : { devToken: token };
  }

  async resetPassword(token: string, newPassword: string, request: Request): Promise<void> {
    const record = await this.prisma.authToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
    if (!record || record.purpose !== 'password_reset' || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw ApiException.badRequest('This reset link is invalid or has expired.');
    }
    const passwordHash = await argonHash(newPassword, ARGON_OPTIONS);
    await this.prisma.$transaction([
      this.prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
      this.prisma.userSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_reset' },
      }),
    ]);
    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (user) await this.mail.sendSecurityAlert(user.email, 'Your ScamShield AI password was reset.');
    await this.audit.record({
      actorId: record.userId,
      action: 'auth.password_reset',
      resourceType: 'user',
      resourceId: record.userId,
      outcome: 'success',
      request,
    });
  }

  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
    request: Request,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiException.notFound('Account not found');
    const ok = await this.verifyPassword(user.passwordHash, currentPassword);
    if (!ok) {
      await this.audit.record({
        actorId: userId,
        action: 'auth.password_change',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'failure',
        request,
      });
      throw ApiException.badRequest('Your current password is incorrect.', { currentPassword: ['Incorrect password'] });
    }
    const passwordHash = await argonHash(newPassword, ARGON_OPTIONS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null, NOT: { id: sessionId } },
        data: { revokedAt: new Date(), revokedReason: 'password_changed' },
      }),
    ]);
    await this.mail.sendSecurityAlert(user.email, 'Your ScamShield AI password was changed.');
    await this.audit.record({
      actorId: userId,
      action: 'auth.password_change',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      request,
    });
  }

  // ------------------------------------------------------------------------- MFA

  async setupMfa(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiException.notFound('Account not found');
    if (user.mfaEnabled) throw ApiException.conflict('MFA is already enabled.');
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEncrypted: encryptSecret(secret) },
    });
    return { secret, otpauthUri: otpauthUri(secret, user.email) };
  }

  async enableMfa(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaSecretEncrypted) throw ApiException.badRequest('Start MFA setup first.');
    if (!verifyTotp(decryptSecret(user.mfaSecretEncrypted), code)) {
      throw ApiException.badRequest('That code is not valid. Check your authenticator app and try again.', {
        code: ['Invalid code'],
      });
    }
    const recoveryCodes = generateRecoveryCodes(10);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaRecoveryCodeHashes: recoveryCodes.map((value) => sha256Hex(value)),
      },
    });
    return { recoveryCodes };
  }

  async disableMfa(userId: string, password: string, request: Request): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiException.notFound('Account not found');
    if (!(await this.verifyPassword(user.passwordHash, password))) {
      throw ApiException.badRequest('Your password is incorrect.', { password: ['Incorrect password'] });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaRecoveryCodeHashes: [] },
    });
    await this.audit.record({
      actorId: userId,
      action: 'auth.mfa_disabled',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      request,
    });
  }

  private async consumeMfaCode(
    userId: string,
    encryptedSecret: string | null,
    recoveryHashes: string[],
    code: string,
  ): Promise<boolean> {
    const normalized = code.replace(/\s/g, '').toUpperCase();
    if (encryptedSecret && /^\d{6}$/.test(normalized)) {
      return verifyTotp(decryptSecret(encryptedSecret), normalized);
    }
    const hash = sha256Hex(normalized);
    if (recoveryHashes.includes(hash)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { mfaRecoveryCodeHashes: recoveryHashes.filter((value) => value !== hash) },
      });
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------------- helpers

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: profileInclude,
    });
    if (!user) throw ApiException.notFound('Account not found');
    return this.buildProfile(user);
  }

  buildProfile(user: UserWithProfile): UserProfile {
    const subscription = user.subscriptions[0];
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: Boolean(user.emailVerifiedAt),
      mfaEnabled: user.mfaEnabled,
      roles: user.roles.map((entry) => entry.role.name),
      createdAt: user.createdAt.toISOString(),
      plan: subscription
        ? {
            name: subscription.plan.name,
            dailyScanLimit: subscription.plan.dailyScanLimit,
            monthlyScanLimit: subscription.plan.monthlyScanLimit,
          }
        : { name: 'Guardian Free', dailyScanLimit: 10, monthlyScanLimit: 100 },
      notificationPreferences: parseNotificationPreferences(user.notificationPreferences),
      privacyPreferences: parsePrivacyPreferences(user.privacyPreferences),
    };
  }

  private async verifyPassword(hashValue: string, password: string): Promise<boolean> {
    try {
      return await argonVerify(hashValue, password, ARGON_OPTIONS);
    } catch {
      return false;
    }
  }

  /** Equalises response time for unknown accounts. */
  private async verifyDummyPassword(password: string): Promise<void> {
    this.dummyHashPromise ??= argonHash('scamshield-placeholder-password', ARGON_OPTIONS);
    const dummy = await this.dummyHashPromise;
    await argonVerify(dummy, password, ARGON_OPTIONS).catch(() => false);
  }

  private async registerFailedLogin(userId: string, request: Request, reason: string): Promise<void> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true, email: true },
    });
    if (user.failedLoginCount >= LOGIN_MAX_FAILURES) {
      const lockedUntil = new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000);
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil, failedLoginCount: 0 },
      });
      this.logger.warn(`Account ${userId} locked until ${lockedUntil.toISOString()} after repeated failures`);
      if (this.mail.enabled) {
        await this.mail.sendSecurityAlert(
          user.email,
          `We locked sign-in for ${LOGIN_LOCK_MINUTES} minutes after ${LOGIN_MAX_FAILURES} failed attempts.`,
        );
      }
    }
    await this.audit.record({
      actorId: userId,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'failure',
      request,
      metadata: { reason },
    });
  }
}
