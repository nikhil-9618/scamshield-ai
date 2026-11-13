import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Integration tests against a real PostgreSQL database (scamshield_test).
 * They exercise the global guard chain and persistence, not mocks.
 */
describe('API security boundaries (e2e)', () => {
  let app: INestApplication;
  let sessionCookie = '';
  let csrfToken = '';
  let csrfCookie = '';
  const email = `e2e-${Date.now()}@scamshield.test`;
  const password = 'TestPass!2026Secure';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: true });
    app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function cookieHeader(): string {
    return [sessionCookie, csrfCookie].filter(Boolean).join('; ');
  }

  it('registers a user, sets an httpOnly session cookie and returns a CSRF token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, displayName: 'E2E Tester', acceptTerms: true })
      .expect(201);

    expect(response.body.user.email).toBe(email);
    expect(response.body.csrfToken.length).toBeGreaterThanOrEqual(40);
    const rawCookies = response.headers['set-cookie'];
    const cookies: string[] = Array.isArray(rawCookies)
      ? rawCookies
      : String(rawCookies ?? '').split(/,(?=[^;,]+=[^;,]+)/);
    expect(cookies.join(';')).toMatch(/ss_session=/);
    expect(cookies.join(';')).toMatch(/HttpOnly/i);

    const cookieValue = (name: string) =>
      cookies
        .map((cookie) => cookie.split(';')[0]?.trim() ?? '')
        .find((cookie) => cookie.startsWith(`${name}=`)) ?? '';
    sessionCookie = cookieValue('ss_session');
    csrfCookie = cookieValue('ss_csrf');
    csrfToken = response.body.csrfToken;
    expect(sessionCookie).not.toBe('');
  });

  it('rejects a mutating request without the CSRF header', async () => {
    await request(app.getHttpServer())
      .post('/api/scans/message')
      .set('Cookie', cookieHeader())
      .send({ content: 'This is a test message with a refundable registration fee of Rs 499.', channel: 'sms', consentToStore: false })
      .expect(403);
  });

  it('accepts a scan with CSRF and persists a result', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/scans/message')
      .set('Cookie', cookieHeader())
      .set('x-csrf-token', csrfToken)
      .send({
        content:
          'URGENT: your SBI account will be blocked today. Complete KYC at http://sbi-kyc-verify.top and send the OTP to our executive immediately.',
        channel: 'sms',
        consentToStore: false,
      })
      .expect(201);

    expect(response.body.id).toBeTruthy();
    expect(response.body.analysis.riskScore).toBeGreaterThanOrEqual(50);
    expect(response.body.hasStoredContent).toBe(false);

    const detail = await request(app.getHttpServer())
      .get(`/api/scans/${response.body.id}`)
      .set('Cookie', cookieHeader())
      .expect(200);
    expect(detail.body.analysis).toBeTruthy();
    expect(detail.body.analysis.findings.length).toBeGreaterThan(0);
  });

  it('refuses a URL that resolves to a private or loopback address', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/scans/url')
      .set('Cookie', cookieHeader())
      .set('x-csrf-token', csrfToken)
      .send({ url: 'http://127.0.0.1/health', consentToStore: false })
      .expect(400);
    expect(response.body.message).toMatch(/IP address|private|local/i);
  });

  it('blocks a plain user from admin endpoints', async () => {
    await request(app.getHttpServer()).get('/api/admin/analytics').set('Cookie', cookieHeader()).expect(403);
    await request(app.getHttpServer()).get('/api/admin/system-health').set('Cookie', cookieHeader()).expect(403);
  });

  it('requires authentication for private data', async () => {
    await request(app.getHttpServer()).get('/api/users/me').expect(401);
    await request(app.getHttpServer()).get('/api/scans').expect(401);
  });

  it('prevents one user from reading another user’s scan', async () => {
    const attackerEmail = `attacker-${Date.now()}@scamshield.test`;
    const attacker = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: attackerEmail, password, displayName: 'Attacker', acceptTerms: true })
      .expect(201);
    const cookies = attacker.headers['set-cookie'] as unknown as string[];

    const ownScan = await request(app.getHttpServer())
      .post('/api/scans/message')
      .set('Cookie', cookies.join('; '))
      .set('x-csrf-token', attacker.body.csrfToken)
      .send({ content: 'Generic notification text about your recent order being delivered tomorrow.', channel: 'sms', consentToStore: false })
      .expect(201);

    const firstUserScan = await request(app.getHttpServer()).get('/api/scans').set('Cookie', cookieHeader()).expect(200);
    const foreignId = firstUserScan.body.items[0]?.id;
    expect(foreignId).toBeTruthy();
    expect(foreignId).not.toBe(ownScan.body.id);
    await request(app.getHttpServer()).get(`/api/scans/${foreignId}`).set('Cookie', cookies.join('; ')).expect(404);
  });

  it('rejects a login with a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'WrongPassword!2026' })
      .expect(401);
  });

  it('rejects a mutating request from a foreign origin with 403', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email, password })
      .expect(403);
  });

  it('logs out and invalidates the session cookie for private endpoints', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader())
      .set('x-csrf-token', csrfToken)
      .expect(204);
    await request(app.getHttpServer()).get('/api/users/me').set('Cookie', cookieHeader()).expect(401);
  });
});
