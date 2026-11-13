import { isPublicIp, validateDestination } from '../src/scans/detectors/ssrf';
import { generateTotp, verifyTotp, generateTotpSecret, generateRecoveryCodes, base32Decode, base32Encode } from '../src/auth/totp';
import { analyzeEmailHeaders, parseEmail } from '../src/scans/detectors/email-parser';

describe('SSRF destination validation', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.9',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '198.51.100.4',
    '::1',
    'fe80::1',
    'fd00::1',
    '::ffff:127.0.0.1',
  ])('rejects non-public address %s', (address) => {
    expect(isPublicIp(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '93.184.216.34'])('accepts public address %s', (address) => {
    expect(isPublicIp(address)).toBe(true);
  });

  it.each([
    'http://localhost/',
    'http://localhost.localdomain/',
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/',
    'http://10.0.0.5/',
    'ftp://example.com/file',
    'file:///etc/passwd',
    'gopher://example.com/',
    'http://user:password@example.com/',
    'http://example.com:8080/',
  ])('refuses unsafe URL %s', async (url) => {
    await expect(validateDestination(url)).rejects.toBeDefined();
  });

  it('refuses non-standard ports and IP literals with a safe error code', async () => {
    await expect(validateDestination('http://example.com:6379/')).rejects.toMatchObject({ code: 'UNSAFE_URL' });
    await expect(validateDestination('http://93.184.216.34/')).rejects.toMatchObject({ code: 'UNSAFE_URL' });
  });
});

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 test vector', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(generateTotp(secret, 59_000, 30, 8)).toBe('94287082');
  });

  it('round-trips base32 and verifies a current code', () => {
    const secret = generateTotpSecret();
    const decoded = base32Decode(secret);
    expect(decoded.length).toBe(20);
    const code = generateTotp(secret);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(false);
    expect(verifyTotp(secret, 'not-a-code')).toBe(false);
  });

  it('generates unique recovery codes in a readable format', () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^[A-F0-9]{5}-[A-F0-9]{5}$/);
  });
});

describe('email header analysis', () => {
  const impersonationEmail = [
    'From: "HDFC Bank Security" <alerts@random-mailer.example>',
    'Reply-To: recovery@another-domain.top',
    'Subject: Your account will be suspended',
    'To: customer@example.com',
    '',
    'Dear customer, please verify your KYC.',
  ].join('\n');

  it('detects display-name impersonation and reply-to mismatch', () => {
    const parsed = parseEmail(impersonationEmail);
    const result = analyzeEmailHeaders(parsed);
    const keys = result.findings.map((item) => item.key);
    expect(keys).toContain('display_name_impersonation');
    expect(keys).toContain('reply_to_mismatch');
  });

  it('never treats absent authentication headers as fraud', () => {
    const parsed = parseEmail(impersonationEmail);
    const result = analyzeEmailHeaders(parsed);
    expect(result.findings.map((item) => item.key)).not.toContain('spf_failure');
    expect(result.limitations.join(' ')).toMatch(/absence is not evidence of fraud/i);
  });

  it('reports a recorded SPF failure with the header as evidence', () => {
    const parsed = parseEmail(
      [
        'From: "HDFC Bank" <alerts@hdfcbank.com>',
        'Authentication-Results: mx.example; spf=fail dkim=fail dmarc=fail',
        'Subject: Verify',
        '',
        'Body',
      ].join('\n'),
    );
    const result = analyzeEmailHeaders(parsed);
    const spf = result.findings.find((item) => item.key === 'spf_failure');
    expect(spf).toBeDefined();
    expect(spf?.severity).toBe('high');
    expect(spf?.evidence).toMatch(/SPF=fail/);
  });

  it('parses display names and addresses without trusting them', () => {
    const parsed = parseEmail(impersonationEmail);
    expect(parsed.from?.address).toBe('alerts@random-mailer.example');
    expect(parsed.from?.displayName).toBe('HDFC Bank Security');
    expect(parsed.replyTo?.address).toBe('recovery@another-domain.top');
  });
});
