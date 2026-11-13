import { Global, Injectable, Logger, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { loadEnv } from '../config/env';
import { isProduction } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly env = loadEnv();
  private readonly transport: Transporter | null;

  constructor() {
    if (this.env.EMAIL_ENABLED && this.env.SMTP_HOST) {
      this.transport = nodemailer.createTransport({
        host: this.env.SMTP_HOST,
        port: this.env.SMTP_PORT,
        secure: this.env.SMTP_SECURE,
        auth: this.env.SMTP_USER
          ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASSWORD ?? '' }
          : undefined,
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 12000,
      });
    } else {
      this.transport = null;
      this.logger.warn('SMTP is not configured. Email delivery is disabled; in-app notifications still work.');
    }
  }

  get enabled(): boolean {
    return this.transport !== null;
  }

  async send(message: MailMessage): Promise<{ sent: boolean; reason?: string }> {
    if (!this.transport) return { sent: false, reason: 'smtp_not_configured' };
    try {
      await this.transport.sendMail({
        from: this.env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { sent: true };
    } catch (error) {
      this.logger.error(`Email delivery failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return { sent: false, reason: 'delivery_failed' };
    }
  }

  /**
   * In development without SMTP, print the action link to the API log so the flow
   * is testable. In production the link is never logged.
   */
  logDevLink(purpose: string, to: string, url: string): void {
    if (isProduction(this.env) || this.enabled) return;
    this.logger.log(`[DEV ONLY] ${purpose} link for ${to}: ${url}`);
  }

  async sendVerification(to: string, url: string): Promise<{ sent: boolean; reason?: string }> {
    this.logDevLink('Email verification', to, url);
    return this.send({
      to,
      subject: 'Verify your ScamShield AI email',
      text: `Welcome to ScamShield AI.\n\nVerify your email address (link expires in 24 hours):\n${url}\n\nIf you did not create this account, ignore this email.`,
      html: `<p>Welcome to ScamShield AI.</p><p><a href="${url}">Verify your email address</a> (expires in 24 hours).</p><p>If you did not create this account, ignore this email.</p>`,
    });
  }

  async sendPasswordReset(to: string, url: string): Promise<{ sent: boolean; reason?: string }> {
    this.logDevLink('Password reset', to, url);
    return this.send({
      to,
      subject: 'Reset your ScamShield AI password',
      text: `A password reset was requested for your account (link expires in 60 minutes):\n${url}\n\nIf this was not you, ignore this email and consider changing your password.`,
    });
  }

  async sendSecurityAlert(to: string, message: string): Promise<{ sent: boolean; reason?: string }> {
    return this.send({
      to,
      subject: 'ScamShield AI security alert',
      text: `${message}\n\nIf this was not you, reset your password and review your active sessions.`,
    });
  }

  /**
   * Scan alerts intentionally omit the submitted content: email is not a safe
   * channel for potentially sensitive material.
   */
  async sendScanAlert(to: string, riskLevel: string, scanId: string, appOrigin: string): Promise<{ sent: boolean; reason?: string }> {
    return this.send({
      to,
      subject: `ScamShield AI: a recent scan was rated ${riskLevel} risk`,
      text: `One of your recent scans was rated ${riskLevel} risk.\n\nOpen your dashboard to review the findings and recommended actions:\n${appOrigin}/scans/${scanId}\n\nFor your privacy, the submitted content is not included in this email.`,
    });
  }

  async sendReportStatus(to: string, status: string, category: string): Promise<{ sent: boolean; reason?: string }> {
    return this.send({
      to,
      subject: 'ScamShield AI: community report update',
      text: `Your community report (${category}) is now marked "${status}".\n\nThank you for helping other users.`,
    });
  }
}

@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
