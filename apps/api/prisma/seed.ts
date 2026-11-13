/**
 * Idempotent seed: reference data (roles, plans, intel sources) plus optional
 * development accounts. No scans, analytics, threat domains or reports are
 * fabricated here — the dashboard only ever shows records created by real use.
 */
import { PrismaClient } from '@prisma/client';
import { Algorithm, hash as argonHash } from '@node-rs/argon2';
import {
  PLAN_DEFINITIONS,
  ROLE_DEFINITIONS,
  THREAT_SOURCE_DEFINITIONS,
} from '../src/common/catalog/catalog.service';

const prisma = new PrismaClient();

async function upsertCatalog(): Promise<void> {
  for (const role of ROLE_DEFINITIONS) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, permissions: [...role.permissions] },
      create: { name: role.name, description: role.description, permissions: [...role.permissions] },
    });
  }
  for (const plan of PLAN_DEFINITIONS) {
    await prisma.subscriptionPlan.upsert({
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
    await prisma.threatSource.upsert({
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

async function upsertUser(input: {
  email: string;
  password: string;
  displayName: string;
  role: string;
  verified: boolean;
}): Promise<void> {
  const passwordHash = await argonHash(input.password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const role = await prisma.role.findUnique({ where: { name: input.role } });
  const freePlan = await prisma.subscriptionPlan.findUnique({ where: { slug: 'free' } });
  if (!role) throw new Error(`Role ${input.role} missing`);

  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {
      displayName: input.displayName,
      passwordHash,
      emailVerifiedAt: input.verified ? new Date() : null,
      deletedAt: null,
      suspendedAt: null,
    },
    create: {
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      emailVerifiedAt: input.verified ? new Date() : null,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
  if (freePlan) {
    const subscription = await prisma.userSubscription.findFirst({ where: { userId: user.id, status: 'active' } });
    if (!subscription) {
      await prisma.userSubscription.create({ data: { userId: user.id, planId: freePlan.id, status: 'active' } });
    }
  }
}

async function main(): Promise<void> {
  await upsertCatalog();
  console.log('Reference data ready (roles, subscription plans, threat sources).');

  if (process.env.SEED_DEMO_DATA === 'true' && process.env.NODE_ENV !== 'production') {
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@scamshield.local';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (adminPassword) {
      await upsertUser({
        email: adminEmail,
        password: adminPassword,
        displayName: 'ScamShield Admin',
        role: 'admin',
        verified: true,
      });
      console.log(`Development admin ready: ${adminEmail}`);
    } else {
      console.warn('SEED_ADMIN_PASSWORD is not set; skipping development admin account.');
    }

    const demoEmail = process.env.SEED_DEMO_EMAIL ?? 'demo@scamshield.local';
    const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'Demo!ScamShield2026';
    await upsertUser({
      email: demoEmail,
      password: demoPassword,
      displayName: 'Demo User',
      role: 'user',
      verified: true,
    });
    console.log(`Development demo account ready: ${demoEmail}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
