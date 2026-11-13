import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { connect as tlsConnect, checkServerIdentity, type PeerCertificate } from 'node:tls';
import { Agent, fetch as undiciFetch } from 'undici';
import { ApiException } from '../../common/http/api-exception';

/**
 * SSRF protection for the URL scanner.
 *
 * Rules enforced here:
 *  - http/https only, no credentials in the URL, no IP-literal hosts;
 *  - DNS resolution with every returned address checked against private,
 *    loopback, link-local, CGNAT, multicast, documentation, ULA and metadata
 *    ranges;
 *  - connections are pinned to the validated IP (DNS rebinding defence);
 *  - redirects are followed manually and every hop is re-validated;
 *  - hard connect/total timeouts, bounded response size;
 *  - no JavaScript execution, no cookies, no auth headers forwarded.
 */

const BLOCKED_IPV4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
  ['255.255.255.255', 32],
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'kubernetes',
  'kubernetes.default',
]);

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return ((octets[0]! << 24) | (octets[1]! << 16) | (octets[2]! << 8) | octets[3]!) >>> 0;
}

function inCidr(address: string, base: string, prefix: number): boolean {
  const ip = ipv4ToInt(address);
  const network = ipv4ToInt(base);
  if (ip === null || network === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ip & mask) === (network & mask);
}

export function isPublicIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    if (BLOCKED_IPV4.some(([base, prefix]) => inCidr(address, base, prefix))) return false;
    return true;
  }
  if (version === 6) {
    const normalized = address.toLowerCase().split('%')[0] ?? address.toLowerCase();
    if (normalized === '::' || normalized === '::1') return false;
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return false;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return false;
    if (normalized.startsWith('ff')) return false;
    if (normalized.startsWith('2001:db8')) return false;
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      return isPublicIp(mapped);
    }
    if (normalized.startsWith('64:ff9b::')) {
      const embedded = normalized.slice('64:ff9b::'.length);
      const parts = embedded.split('.');
      if (parts.length === 4) return isPublicIp(embedded);
    }
    if (normalized.startsWith('2002:')) {
      // 6to4 embeds an IPv4 address in the next two hextets.
      const hextets = normalized.split(':');
      const hi = parseInt(hextets[1] ?? '0', 16);
      const lo = parseInt(hextets[2] ?? '0', 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const embedded = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
        return isPublicIp(embedded);
      }
    }
    return true;
  }
  return false;
}

export interface ValidatedTarget {
  url: URL;
  hostname: string;
  address: string;
  family: number;
}

export async function validateDestination(rawUrl: string): Promise<ValidatedTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw ApiException.badRequest('That URL could not be parsed.', { url: ['Enter a valid URL'] });
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ApiException({ code: 'UNSAFE_URL', message: 'Only http and https URLs can be inspected.', status: 400 });
  }
  if (url.username || url.password) {
    throw new ApiException({ code: 'UNSAFE_URL', message: 'URLs containing credentials cannot be inspected.', status: 400 });
  }
  if (url.port && !['80', '443', ''].includes(url.port)) {
    throw new ApiException({
      code: 'UNSAFE_URL',
      message: 'Non-standard ports are not inspected for safety reasons.',
      status: 400,
    });
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) throw ApiException.badRequest('That URL is missing a hostname.');
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.internal')) {
    throw new ApiException({
      code: 'UNSAFE_URL',
      message: 'Local, private and internal addresses cannot be scanned.',
      status: 400,
    });
  }

  if (isIP(hostname)) {
    throw new ApiException({
      code: 'UNSAFE_URL',
      message: 'URLs that point directly at an IP address cannot be scanned. Use a domain name instead.',
      status: 400,
    });
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await withTimeout(lookup(hostname, { all: true, verbatim: true }), 4000, 'dns_timeout');
  } catch {
    throw new ApiException({
      code: 'SCAN_FAILED',
      message: 'That domain could not be resolved. Check the spelling, or it may not exist yet.',
      status: 422,
    });
  }
  if (records.length === 0) {
    throw new ApiException({
      code: 'SCAN_FAILED',
      message: 'That domain has no DNS records. This is often a sign of a newly created or fake domain.',
      status: 422,
    });
  }
  const blocked = records.find((record) => !isPublicIp(record.address));
  if (blocked) {
    throw new ApiException({
      code: 'UNSAFE_URL',
      message: 'This URL resolves to a private, local or reserved address, so it cannot be inspected.',
      status: 400,
    });
  }

  const chosen = records.find((record) => record.family === 4) ?? records[0]!;
  return { url, hostname, address: chosen.address, family: chosen.family };
}

function withTimeout<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(reason)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export interface SafeResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyTruncated: boolean;
  finalUrl: string;
  redirectChain: string[];
  contentLength: number;
}

const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;

/**
 * Fetches a URL without following redirects automatically. Each hop is
 * re-validated and pinned, so a redirect cannot smuggle the scanner into a
 * private network. Response bodies are read as text only, never executed.
 */
export async function safeFetch(rawUrl: string, options: { timeoutMs?: number } = {}): Promise<SafeResponse> {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  const redirectChain: string[] = [];
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const target = await validateDestination(current);
    const remaining = Math.max(1500, deadline - Date.now());
    const dispatcher = new Agent({
      connect: {
        timeout: 5000,
        servername: target.hostname,
        // Pin the connection to the address validated above (DNS rebinding defence).
        lookup: (_hostname, lookupOptions, callback) => {
          const cb = typeof lookupOptions === 'function' ? lookupOptions : callback;
          const all = typeof lookupOptions === 'object' && lookupOptions !== null ? (lookupOptions as { all?: boolean }).all : false;
          if (all) {
            (cb as unknown as (err: null, addresses: Array<{ address: string; family: number }>) => void)(null, [
              { address: target.address, family: target.family },
            ]);
          } else {
            (cb as unknown as (err: null, address: string, family: number) => void)(null, target.address, target.family);
          }
        },
      },
    });

    try {
      const response = await undiciFetch(target.url.toString(), {
        method: 'GET',
        redirect: 'manual',
        dispatcher,
        signal: AbortSignal.timeout(remaining),
        headers: {
          'user-agent': 'ScamShieldAI/1.0 (+https://scamshield.local; safety analysis)',
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
          'accept-language': 'en-IN,en;q=0.8',
          'x-scamshield-scan': 'url-reputation-check',
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          return finish(response, target.url.toString(), redirectChain, '');
        }
        const next = new URL(location, target.url).toString();
        redirectChain.push(next);
        if (hop === MAX_REDIRECTS) {
          throw new ApiException({
            code: 'SCAN_FAILED',
            message: 'That link redirects too many times, which is itself suspicious.',
            status: 422,
          });
        }
        current = next;
        await response.body?.cancel();
        continue;
      }

      const { text, truncated } = await readBounded(response, MAX_BYTES);
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: text,
        bodyTruncated: truncated,
        finalUrl: target.url.toString(),
        redirectChain,
        contentLength: Buffer.byteLength(text, 'utf8'),
      };
    } catch (error) {
      if (error instanceof ApiException) throw error;
      const message = error instanceof Error ? error.message : 'request failed';
      throw new ApiException({
        code: 'SCAN_FAILED',
        message: `The site could not be reached safely (${message.slice(0, 120)}). It may be offline, blocking automated checks, or intentionally evading analysis.`,
        status: 422,
      });
    } finally {
      await dispatcher.close().catch(() => undefined);
    }
  }

  throw new ApiException({ code: 'SCAN_FAILED', message: 'Redirect limit exceeded.', status: 422 });
}

async function readBounded(response: Awaited<ReturnType<typeof undiciFetch>>, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!/text\/|html|xml|json|javascript/.test(contentType)) {
    await response.body?.cancel();
    return { text: '', truncated: false };
  }
  if (!response.body) return { text: '', truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > maxBytes) {
      chunks.push(value.slice(0, maxBytes - (received - value.byteLength)));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), truncated };
}

function finish(
  response: Awaited<ReturnType<typeof undiciFetch>>,
  finalUrl: string,
  chain: string[],
  body: string,
): SafeResponse {
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    bodyTruncated: false,
    finalUrl,
    redirectChain: chain,
    contentLength: Buffer.byteLength(body, 'utf8'),
  };
}

export interface TlsInfo {
  reachable: boolean;
  valid: boolean;
  hostnameMismatch: boolean;
  selfSigned: boolean;
  expired: boolean;
  expiresInDays: number | null;
  issuer: string | null;
  error: string | null;
}

/** Certificate inspection with verification disabled on purpose (we report, not trust). */
export async function inspectTls(hostname: string, timeoutMs = 5000): Promise<TlsInfo> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (info: TlsInfo) => {
      if (settled) return;
      settled = true;
      resolve(info);
    };
    const socket = tlsConnect(
      { host: hostname, port: 443, servername: hostname, rejectUnauthorized: false, timeout: timeoutMs },
      () => {
        const cert = socket.getPeerCertificate() as PeerCertificate | Record<string, never>;
        if (!cert || !('valid_to' in cert)) {
          socket.destroy();
          done({ reachable: true, valid: false, hostnameMismatch: false, selfSigned: false, expired: false, expiresInDays: null, issuer: null, error: 'No certificate presented' });
          return;
        }
        const validTo = new Date(cert.valid_to);
        const expiresInDays = Math.round((validTo.getTime() - Date.now()) / 86_400_000);
        const identityError = checkServerIdentity(hostname, cert as PeerCertificate);
        const issuerRaw = cert.issuer?.O ?? cert.issuer?.CN;
        const issuerName = Array.isArray(issuerRaw) ? (issuerRaw[0] ?? null) : (issuerRaw ?? null);
        done({
          reachable: true,
          valid: !identityError && expiresInDays >= 0,
          hostnameMismatch: Boolean(identityError),
          selfSigned: cert.issuer?.CN === cert.subject?.CN,
          expired: expiresInDays < 0,
          expiresInDays,
          issuer: issuerName,
          error: identityError ? identityError.message : null,
        });
        socket.end();
      },
    );
    socket.on('timeout', () => {
      socket.destroy();
      done({ reachable: false, valid: false, hostnameMismatch: false, selfSigned: false, expired: false, expiresInDays: null, issuer: null, error: 'TLS connection timed out' });
    });
    socket.on('error', (error) => {
      done({ reachable: false, valid: false, hostnameMismatch: false, selfSigned: false, expired: false, expiresInDays: null, issuer: null, error: error.message });
    });
  });
}

export { withTimeout };
