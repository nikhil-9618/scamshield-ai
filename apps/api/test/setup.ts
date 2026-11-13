process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://scamshield:scamshield@127.0.0.1:5432/scamshield_test?schema=public';
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString('base64');
process.env.INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? 'test-internal-token';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.REDIS_URL = '';
process.env.EMAIL_ENABLED = 'false';
process.env.AI_ENGINE_ENABLED = 'false';
process.env.THREAT_INTEL_DEV_FIXTURES = 'true';
process.env.URLHAUS_ENABLED = 'false';
process.env.PHISHTANK_ENABLED = 'false';
process.env.GOOGLE_SAFE_BROWSING_API_KEY = '';
process.env.VIRUSTOTAL_API_KEY = '';
process.env.COOKIE_SECURE = 'false';
process.env.ENABLE_API_DOCS = 'false';
process.env.THROTTLE_LIMIT = '10000';
process.env.AUTH_THROTTLE_LIMIT = '1000';
process.env.SCAN_THROTTLE_LIMIT = '1000';
process.env.REPORT_THROTTLE_LIMIT = '1000';
process.env.LOG_LEVEL = 'error';
process.env.SEED_DEMO_DATA = 'false';

jest.setTimeout(30_000);
