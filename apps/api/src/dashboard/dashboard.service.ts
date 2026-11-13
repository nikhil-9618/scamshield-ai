import { Injectable } from '@nestjs/common';
import type {
  DashboardAnalytics,
  DistributionSlice,
  RiskLevel,
  ScamCategory,
  ScanRecord,
  TrendPoint,
} from '@scamshield/shared-types';
import { CATEGORY_LABELS, RISK_LEVEL_LABELS } from '@scamshield/shared-types';
import { PrismaService } from '../common/prisma/prisma.service';
import { profileInclude } from '../auth/auth.service';

const RISK_ORDER: RiskLevel[] = ['low', 'moderate', 'high', 'critical'];

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async analytics(userId: string): Promise<DashboardAnalytics> {
    const base = { userId, deletedAt: null as Date | null };
    const now = Date.now();
    const since7 = new Date(now - 7 * 86_400_000);
    const since14 = new Date(now - 14 * 86_400_000);
    const since24h = new Date(now - 86_400_000);

    const [totalScans, suspiciousScans, highRiskScans, criticalScans, scansLast7Days, aggregate, riskGroups, categoryGroups, trendScans, recent, alerts, user] =
      await this.prisma.$transaction([
        this.prisma.scan.count({ where: base }),
        this.prisma.scan.count({ where: { ...base, riskScore: { gte: 25 } } }),
        this.prisma.scan.count({ where: { ...base, riskScore: { gte: 50 } } }),
        this.prisma.scan.count({ where: { ...base, riskScore: { gte: 75 } } }),
        this.prisma.scan.count({ where: { ...base, createdAt: { gte: since7 } } }),
        this.prisma.scan.aggregate({ where: base, _avg: { riskScore: true } }),
        this.prisma.scan.groupBy({
          by: ['riskLevel'],
          where: { ...base, status: 'completed' },
          _count: true,
          orderBy: { riskLevel: 'asc' },
        }),
        this.prisma.scan.groupBy({
          by: ['primaryCategory'],
          where: { ...base, status: 'completed', primaryCategory: { not: null } },
          _count: true,
          orderBy: { primaryCategory: 'asc' },
        }),
        this.prisma.scan.findMany({
          where: { ...base, createdAt: { gte: since14 } },
          select: { createdAt: true, riskScore: true },
        }),
        this.prisma.scan.findMany({ where: base, orderBy: { createdAt: 'desc' }, take: 5 }),
        this.prisma.notification.findMany({ where: { userId, readAt: null }, orderBy: { createdAt: 'desc' }, take: 5 }),
        this.prisma.user.findUnique({ where: { id: userId }, include: profileInclude }),
      ]);

    const typedRiskGroups = riskGroups as unknown as Array<{ riskLevel: RiskLevel; _count: { _all: number } }>;
    const typedCategoryGroups = categoryGroups as unknown as Array<{ primaryCategory: string | null; _count: { _all: number } }>;

    const riskDistribution: DistributionSlice<RiskLevel>[] = RISK_ORDER.map((level) => ({
      key: level,
      label: RISK_LEVEL_LABELS[level],
      count: typedRiskGroups.find((group) => group.riskLevel === level)?._count._all ?? 0,
    }));

    const categoryDistribution: DistributionSlice<ScamCategory>[] = typedCategoryGroups
      .filter((group): group is typeof group & { primaryCategory: string } => Boolean(group.primaryCategory))
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 6)
      .map((group) => ({
        key: group.primaryCategory as ScamCategory,
        label: CATEGORY_LABELS[group.primaryCategory as ScamCategory] ?? group.primaryCategory,
        count: group._count._all,
      }));

    const buckets = new Map<string, TrendPoint>();
    for (let index = 13; index >= 0; index -= 1) {
      const date = dayKey(new Date(now - index * 86_400_000));
      buckets.set(date, { date, scans: 0, highRisk: 0 });
    }
    for (const scan of trendScans) {
      const bucket = buckets.get(dayKey(scan.createdAt));
      if (!bucket) continue;
      bucket.scans += 1;
      if ((scan.riskScore ?? 0) >= 50) bucket.highRisk += 1;
    }

    const dailyLimit = user?.subscriptions[0]?.plan.dailyScanLimit ?? 10;
    const scansUsedToday = await this.prisma.scan.count({ where: { ...base, createdAt: { gte: since24h } } });

    const recentScans: ScanRecord[] = recent.map((scan) => ({
      id: scan.id,
      type: scan.type,
      status: scan.status,
      riskScore: scan.riskScore,
      riskLevel: scan.riskLevel,
      primaryCategory: scan.primaryCategory as ScamCategory | null,
      summary: scan.summary,
      inputPreview: scan.inputPreview,
      hasStoredContent: scan.contentConsent && Boolean(scan.inputEncrypted),
      hasAiExplanation: Boolean(scan.aiExplanation),
      createdAt: scan.createdAt.toISOString(),
      updatedAt: scan.updatedAt.toISOString(),
    }));

    return {
      totalScans,
      suspiciousScans,
      highRiskScans,
      criticalScans,
      scansLast7Days,
      averageRiskScore: Math.round(aggregate._avg.riskScore ?? 0),
      riskDistribution,
      categoryDistribution,
      trend: [...buckets.values()],
      recentScans,
      recentAlerts: alerts.map((alert) => ({
        id: alert.id,
        type: alert.type,
        title: alert.title,
        body: alert.body,
        read: Boolean(alert.readAt),
        metadata: (alert.metadata ?? null) as Record<string, unknown> | null,
        createdAt: alert.createdAt.toISOString(),
      })),
      quotas: { dailyScanLimit: dailyLimit, scansUsedToday },
    };
  }
}
