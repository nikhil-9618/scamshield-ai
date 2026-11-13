import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())));

const intish = (fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return fallback;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
    });

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined));

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Render can expose a referenced service URL as an empty string until the first sync completes. */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * Render (and similar platforms) expose a service hostname without a scheme.
 * Public origins must be HTTPS; internal service addresses default to HTTP.
 */
function normalizePublicOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  return URL_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function normalizeServiceUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  if (URL_SCHEME.test(trimmed)) return trimmed;
  // Render's public hostnames are HTTPS; private host:port addresses are HTTP.
  return /\.onrender\.com(?::\d+)?$/i.test(trimmed) ? `https://${trimmed}` : `http://${trimmed}`;
}

function normalizeOriginList(value: string): string {
  return value
    .split(',')
    .map((origin) => normalizePublicOrigin(origin))
    .filter(Boolean)
    .join(',');
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intish(4000, 1, 65535),
  APP_ORIGIN: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .min(1)
      .transform(normalizePublicOrigin)
      .pipe(z.string().url())
      .default('http://localhost:3000'),
  ),
  CORS_ORIGINS: z.preprocess(
    emptyToUndefined,
    z.string().default('http://localhost:3000').transform(normalizeOriginList),
  ),
  ENABLE_API_DOCS: booleanish.default(false),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TRUST_PROXY: intish(0, 0, 10),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_URL: optionalString,
  QUEUE_CONCURRENCY: intish(2, 1, 20),

  APP_ENCRYPTION_KEY: optionalString,
  INTERNAL_SERVICE_TOKEN: optionalString,
  SESSION_TTL_HOURS: intish(168, 1, 24 * 90),
  SESSION_COOKIE_NAME: z.string().default('ss_session'),
  CSRF_COOKIE_NAME: z.string().default('ss_csrf'),
  COOKIE_SECURE: booleanish.default(false),
  COOKIE_DOMAIN: optionalString,

  THROTTLE_TTL_SECONDS: intish(60, 1, 3600),
  THROTTLE_LIMIT: intish(120, 1, 100_000),
  AUTH_THROTTLE_LIMIT: intish(10, 1, 10_000),
  SCAN_THROTTLE_LIMIT: intish(20, 1, 10_000),
  REPORT_THROTTLE_LIMIT: intish(5, 1, 10_000),

  AI_ENGINE_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .min(1)
      .transform(normalizeServiceUrl)
      .pipe(z.string().url())
      .default('http://localhost:8000'),
  ),
  AI_ENGINE_ENABLED: booleanish.default(true),
  AI_ENGINE_TIMEOUT_MS: intish(8000, 500, 60_000),

  GOOGLE_SAFE_BROWSING_API_KEY: optionalString,
  VIRUSTOTAL_API_KEY: optionalString,
  URLHAUS_ENABLED: booleanish.default(true),
  PHISHTANK_ENABLED: booleanish.default(false),
  PHISHTANK_API_KEY: optionalString,
  THREAT_INTEL_TIMEOUT_MS: intish(4000, 500, 30_000),
  THREAT_INTEL_DEV_FIXTURES: booleanish.default(false),

  SMTP_HOST: optionalString,
  SMTP_PORT: intish(587, 1, 65535),
  SMTP_SECURE: booleanish.default(false),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  EMAIL_FROM: z.string().default('ScamShield AI <no-reply@scamshield.local>'),
  EMAIL_ENABLED: booleanish.default(false),

  SCAN_TIMEOUT_MS: intish(60_000, 5_000, 180_000),
  SCAN_MAX_CONTENT_RETENTION_DAYS: intish(365, 1, 3650),
  DEMO_MODE: booleanish.default(false),

  // One-time first deploy bootstrap. Applied only when no admin account exists.
  BOOTSTRAP_ADMIN_EMAIL: optionalString,
  BOOTSTRAP_ADMIN_PASSWORD: optionalString,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Parses and validates process.env once. Fails fast with an actionable message
 * rather than starting a half-configured production process.
 */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && !process.env.APP_ORIGIN?.trim()) {
    // Never fail the very first Render boot just because the sibling service
    // URL has not propagated yet. Re-syncing the Blueprint replaces this value.
    process.emitWarning(
      'APP_ORIGIN was empty. Using http://localhost:3000 so the API can start; re-sync the Render Blueprint and redeploy once RENDER_EXTERNAL_URL is populated.',
      'ScamShieldConfigWarning',
    );
  }
  if (env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!env.APP_ENCRYPTION_KEY) missing.push('APP_ENCRYPTION_KEY');
    if (!env.INTERNAL_SERVICE_TOKEN) missing.push('INTERNAL_SERVICE_TOKEN');
    if (!env.COOKIE_SECURE) missing.push('COOKIE_SECURE=true (HTTPS only)');
    if (env.THREAT_INTEL_DEV_FIXTURES) missing.push('THREAT_INTEL_DEV_FIXTURES must be false in production');
    if (env.CORS_ORIGINS.includes('*')) missing.push('CORS_ORIGINS must not contain wildcards');
    if (missing.length > 0) {
      throw new Error(`Refusing to start in production with unsafe configuration:\n${missing.map((m) => `  - ${m}`).join('\n')}`);
    }
  }
  cached = env;
  return env;
}

export function isProduction(env: Env): boolean {
  return env.NODE_ENV === 'production';
}

export function corsOrigins(env: Env): string[] {
  const configured = env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : [env.APP_ORIGIN];
}
