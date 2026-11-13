import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Idempotent reference data required for the application to function:
 * roles, permission sets, subscription plans and threat-intelligence sources.
 * Demo users/content live in prisma/seed.ts and are never created here.
 */
export const ROLE_DEFINITIONS = [
  {
    name: 'user',
    description: 'Standard account: own scans, reports and settings.',
    permissions: ['scan:create', 'scan:read:own', 'report:create', 'profile:update'],
  },
  {
    name: 'moderator',
    description: 'Reviews community reports and false-positive feedback.',
    permissions: ['scan:create', 'scan:read:own', 'report:create', 'report:moderate', 'threat:read'],
  },
  {
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
] as const;

export const PLAN_DEFINITIONS = [
  {
    slug: 'free',
    name: 'Guardian Free',
    description: 'Every scanner, transparent findings and a 30-day history.',
    priceMonthlyInr: 0,
    dailyScanLimit: 10,
    monthlyScanLimit: 100,
    features: ['All five scanners', 'Transparent findings', 'Email verification', '30-day scan history'],
  },
  {
    slug: 'plus',
    name: 'Guardian Plus',
    description: 'Higher limits, AI explanations and saved reports for everyday protection.',
    priceMonthlyInr: 249,
    dailyScanLimit: 100,
    monthlyScanLimit: 2000,
    features: ['Everything in Free', 'AI explanations', 'Saved reports', 'Priority scan queue'],
  },
  {
    slug: 'business',
    name: 'Small Business',
    description: 'Volume scanning and moderation for small teams.',
    priceMonthlyInr: 1499,
    dailyScanLimit: 1000,
    monthlyScanLimit: 20000,
    features: ['Everything in Plus', 'Team accounts', 'Community moderation', 'Exportable audit trail'],
  },
] as const;

export const THREAT_SOURCE_DEFINITIONS = [
  { name: 'Google Safe Browsing', kind: 'external', url: 'https://developers.google.com/safe-browsing', reliabilityScore: 90 },
  { name: 'VirusTotal', kind: 'external', url: 'https://www.virustotal.com', reliabilityScore: 85 },
  { name: 'URLhaus', kind: 'external', url: 'https://urlhaus.abuse.ch', reliabilityScore: 80 },
  { name: 'PhishTank', kind: 'external', url: 'https://phishtank.org', reliabilityScore: 75 },
  { name: 'ScamShield Community', kind: 'community', url: null, reliabilityScore: 55 },
  { name: 'ScamShield Manual Review', kind: 'manual', url: null, reliabilityScore: 95 },
] as const;

@Injectable()
export class CatalogService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureCatalog();
    } catch (error) {
      this.logger.error(`Unable to initialise reference data: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  async ensureCatalog(): Promise<void> {
    for (const role of ROLE_DEFINITIONS) {
      await this.prisma.role.upsert({
        where: { name: role.name },
        update: { description: role.description, permissions: [...role.permissions] },
        create: { name: role.name, description: role.description, permissions: [...role.permissions] },
      });
    }
    for (const plan of PLAN_DEFINITIONS) {
      await this.prisma.subscriptionPlan.upsert({
        where: { slug: plan.slug },
        update: {
          name: plan.name,
          description: plan.description,
          priceMonthlyInr: plan.priceMonthlyInr,
          dailyScanLimit: plan.dailyScanLimit,
          monthlyScanLimit: plan.monthlyScanLimit,
          features: [...plan.features],
        },
        create: {
          slug: plan.slug,
          name: plan.name,
          description: plan.description,
          priceMonthlyInr: plan.priceMonthlyInr,
          dailyScanLimit: plan.dailyScanLimit,
          monthlyScanLimit: plan.monthlyScanLimit,
          features: [...plan.features],
        },
      });
    }
    for (const source of THREAT_SOURCE_DEFINITIONS) {
      await this.prisma.threatSource.upsert({
        where: { name: source.name },
        update: { reliabilityScore: source.reliabilityScore, kind: source.kind, url: source.url },
        create: {
          name: source.name,
          kind: source.kind,
          url: source.url,
          reliabilityScore: source.reliabilityScore,
        },
      });
    }
  }
}

@Module({
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
