import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  mfaCodeSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@scamshield/validation';
import type { AuthResult } from '@scamshield/shared-types';
import { AuthService } from './auth.service';
import { CurrentUser, Public, type AuthUser } from '../common/security/auth-user';
import { getRequestCookie } from '../common/security/csrf.guard';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import { loadEnv } from '../common/config/env';

const env = loadEnv();

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: env.AUTH_THROTTLE_LIMIT, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Create an account and start a session' })
  async register(
    @Body(zodPipe(registerSchema)) input: RegisterInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    const result = await this.auth.register(input, request);
    this.applySession(response, result.session.token, result.session.csrfToken, result.session.expiresAt);
    return { user: result.profile, csrfToken: result.session.csrfToken };
  }

  @Public()
  @Throttle({ default: { limit: env.AUTH_THROTTLE_LIMIT, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in with email + password (and MFA when enabled)' })
  async login(
    @Body(zodPipe(loginSchema)) input: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    const result = await this.auth.login(input, request);
    this.applySession(response, result.session.token, result.session.csrfToken, result.session.expiresAt);
    return { user: result.profile, csrfToken: result.session.csrfToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(user.sessionId, request);
    this.clearSession(response);
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: AuthUser, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const revoked = await this.auth.logoutAll(user.id, request);
    this.clearSession(response);
    return { revoked };
  }

  @Get('session')
  @ApiOperation({ summary: 'Return the signed-in user and the CSRF token for this session' })
  async session(@CurrentUser() user: AuthUser, @Req() request: Request): Promise<AuthResult> {
    const profile = await this.auth.getProfile(user.id);
    return { user: profile, csrfToken: getRequestCookie(request, env.CSRF_COOKIE_NAME) ?? '' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body(zodPipe(verifyEmailSchema)) body: { token: string }, @Req() request: Request) {
    await this.auth.verifyEmail(body.token, request);
    return { message: 'Email verified.' };
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('resend-verification')
  @HttpCode(202)
  async resendVerification(@CurrentUser() user: AuthUser) {
    await this.auth.resendVerification(user.id);
    return { message: 'If your email is not verified yet, a new link has been sent.' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(202)
  @ApiOperation({ summary: 'Request a password reset link (no account enumeration)' })
  async forgotPassword(@Body(zodPipe(forgotPasswordSchema)) input: ForgotPasswordInput) {
    const result = await this.auth.forgotPassword(input.email);
    return {
      message: 'If an account exists for that address, a reset link has been sent.',
      ...result,
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Body(zodPipe(resetPasswordSchema)) input: ResetPasswordInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.resetPassword(input.token, input.password, request);
    this.clearSession(response);
    return { message: 'Password updated. Sign in with your new password.' };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(changePasswordSchema)) input: ChangePasswordInput,
    @Req() request: Request,
  ) {
    await this.auth.changePassword(user.id, user.sessionId, input.currentPassword, input.newPassword, request);
    return { message: 'Password changed. Other sessions have been signed out.' };
  }

  @Post('mfa/setup')
  @HttpCode(200)
  async setupMfa(@CurrentUser() user: AuthUser) {
    return this.auth.setupMfa(user.id);
  }

  @Post('mfa/enable')
  @HttpCode(200)
  async enableMfa(@CurrentUser() user: AuthUser, @Body(zodPipe(mfaCodeSchema)) body: { code: string }) {
    return this.auth.enableMfa(user.id, body.code);
  }

  @Post('mfa/disable')
  @HttpCode(200)
  async disableMfa(
    @CurrentUser() user: AuthUser,
    @Body() body: { password?: string },
    @Req() request: Request,
  ) {
    if (!body.password) throw new Error('password is required');
    await this.auth.disableMfa(user.id, body.password, request);
    return { message: 'Multi-factor authentication disabled.' };
  }

  private applySession(response: Response, token: string, csrfToken: string, expiresAt: Date): void {
    const options = this.auth.sessionCookieOptions(expiresAt);
    response.cookie(env.SESSION_COOKIE_NAME, token, options);
    response.cookie(env.CSRF_COOKIE_NAME, csrfToken, options);
  }

  private clearSession(response: Response): void {
    const options = this.auth.sessionCookieOptions(new Date(0));
    response.clearCookie(env.SESSION_COOKIE_NAME, options);
    response.clearCookie(env.CSRF_COOKIE_NAME, options);
  }
}
