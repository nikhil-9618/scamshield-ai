import { Injectable, Logger } from '@nestjs/common';
import type { NotificationDto, Paginated } from '@scamshield/shared-types';
import { PrismaService } from '../common/prisma/prisma.service';
import { MailService } from '../common/mail/mail.service';
import { loadEnv } from '../common/config/env';
import { parseNotificationPreferences } from '../auth/auth.service';

type NotificationType =
  | 'scan_high_risk'
  | 'report_status'
  | 'security'
  | 'email_verified'
  | 'welcome'
  | 'system';

const EMAIL_ELIGIBLE: Record<NotificationType, 'suspiciousScanAlerts' | 'reportStatusAlerts' | 'securityAlerts' | null> = {
  scan_high_risk: 'suspiciousScanAlerts',
  report_status: 'reportStatusAlerts',
  security: 'securityAlerts',
  email_verified: null,
  welcome: null,
  system: null,
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Creates an in-app notification and, when the user opted in and SMTP exists,
   * sends a content-free email alert.
   */
  async create(
    userId: string,
    input: {
      type: NotificationType;
      title: string;
      body: string;
      metadata?: Record<string, unknown>;
      email?:
        | { kind: 'scan'; riskLevel: string; scanId: string }
        | { kind: 'report'; status: string; category: string };
    },
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, notificationPreferences: true },
      });
      if (!user) return;
      const prefs = parseNotificationPreferences(user.notificationPreferences);

      await this.prisma.notification.create({
        data: {
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          metadata: input.metadata as never,
        },
      });

      const emailPreference = EMAIL_ELIGIBLE[input.type];
      const wantsEmail = emailPreference ? prefs[emailPreference] && prefs.emailAlerts : false;
      if (!wantsEmail || !input.email) return;

      let delivered = false;
      if (input.email.kind === 'scan') {
        delivered = (
          await this.mail.sendScanAlert(user.email, input.email.riskLevel, input.email.scanId, this.env.APP_ORIGIN)
        ).sent;
      } else {
        delivered = (await this.mail.sendReportStatus(user.email, input.email.status, input.email.category)).sent;
      }
      if (!delivered) {
        this.logger.debug(`Email notification skipped for ${input.type} (SMTP unavailable)`);
      }
    } catch (error) {
      this.logger.warn(`Failed to create notification: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  async list(userId: string, page: number, pageSize: number): Promise<Paginated<NotificationDto> & { unread: number }> {
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        read: Boolean(item.readAt),
        metadata: (item.metadata ?? null) as Record<string, unknown> | null,
        createdAt: item.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      unread,
    };
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }
}
