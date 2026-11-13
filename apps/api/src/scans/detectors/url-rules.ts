import { ApiException } from '../../common/http/api-exception';
import { findBrandForHost, findBrandsInText, isOfficialDomain, levenshtein, registrableDomain } from './brands';
import { isShortenerHost, normalizeUrlInput } from './extract';
import type { CategoryVotes, RawFinding } from './types';

export interface UrlStructureResult {
  href: string;
  host: string;
  registrable: string;
  findings: RawFinding[];
  categoryVotes: CategoryVotes;
  signalsEvaluated: number;
  blockNetwork: boolean;
  blockReason: string | null;
  limitations: string[];
  isIpLiteral: boolean;
  hasUserinfo: boolean;
  nonStandardPort: boolean;
}

const SUSPICIOUS_TLDS = new Set([
  'top',
  'xyz',
  'icu',
  'tk',
  'ml',
  'ga',
  'cf',
  'gq',
  'click',
  'shop',
  'live',
  'buzz',
  'rest',
  'cam',
  'monster',
  'quest',
  'sbs',
  'cfd',
  'support',
  'help',
  'finance',
  'vip',
  'cc',
  'pro',
  'work',
  'fit',
  'today',
  'link',
]);

const HARVEST_KEYWORDS = [
  'login',
  'signin',
  'sign-in',
  'verify',
  'verification',
  'kyc',
  'otp',
  'password',
  'secure',
  'unlock',
  'update-account',
  'account-update',
  'claim',
  'refund',
  'wallet',
  'reward',
  'gift',
  'bonus',
];

const DANGEROUS_FILE_PATTERN = /\.(apk|exe|scr|msi|bat|cmd|jar|vbs|js|zip|rar|7z)(?:$|[?#])/i;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isIpLiteral(hostname: string): boolean {
  if (IPV4_PATTERN.test(hostname)) return true;
  if (hostname.includes(':')) return true; // IPv6 literal (URL strips brackets)
  return false;
}

/**
 * Structural URL analysis. Runs before any network access and decides whether
 * the destination may be contacted at all.
 */
export function analyzeUrlStructure(rawUrl: string): UrlStructureResult {
  let parsed: URL;
  try {
    parsed = new URL(normalizeUrlInput(rawUrl));
  } catch {
    throw ApiException.badRequest('That URL could not be parsed.', { url: ['Enter a valid http(s) URL'] });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw ApiException.badRequest('Only http and https URLs are supported.', { url: ['Only http(s) URLs are supported'] });
  }

  const host = parsed.hostname.toLowerCase();
  const registrable = registrableDomain(host);
  const findings: RawFinding[] = [];
  const categoryVotes: CategoryVotes = {};
  const limitations = new Set<string>([
    'HTTPS encrypts traffic but says nothing about who operates a site — a padlock is not a safety guarantee.',
  ]);
  let signalsEvaluated = 0;
  let blockNetwork = false;
  let blockReason: string | null = null;

  const add = (
    finding: Omit<RawFinding, 'source' | 'method' | 'observedAt'> & {
      method?: RawFinding['method'];
      source?: RawFinding['source'];
    },
  ) => {
    findings.push({
      ...finding,
      method: finding.method ?? 'heuristic',
      source: finding.source ?? 'scamshield_rules',
      observedAt: new Date().toISOString(),
    });
    if (finding.category) {
      categoryVotes[finding.category] = (categoryVotes[finding.category] ?? 0) + finding.weight;
    }
  };
  const evaluate = () => {
    signalsEvaluated += 1;
  };

  const ipLiteral = isIpLiteral(host);
  const hasUserinfo = Boolean(parsed.username || parsed.password);
  const nonStandardPort = Boolean(parsed.port && !['80', '443'].includes(parsed.port));

  // Scheme -------------------------------------------------------------------
  evaluate();
  if (parsed.protocol === 'http:') {
    add({
      key: 'no_https',
      title: 'No encrypted connection',
      severity: 'medium',
      weight: 18,
      evidence: 'The URL uses http://, so anything you enter can be read or modified in transit.',
      recommendedAction: 'Do not enter passwords, OTPs or card details on an unencrypted (http) page.',
      category: 'phishing',
    });
    limitations.add('The page was analysed over plain HTTP; content may have been altered in transit.');
  } else {
    limitations.add('A valid HTTPS certificate only proves the connection is encrypted; it does not prove the site is legitimate.');
  }

  // Host form ---------------------------------------------------------------
  evaluate();
  if (ipLiteral) {
    blockNetwork = true;
    blockReason = 'IP address host';
    add({
      key: 'ip_literal_host',
      title: 'Link points directly at an IP address',
      severity: 'high',
      weight: 36,
      evidence: `The host is a raw IP address (${host}) rather than a domain name. Legitimate consumer services rarely publish bare IP links.`,
      recommendedAction: 'Do not open it. Ask the organisation for its normal website address.',
      category: 'phishing',
    });
  }
  evaluate();
  if (hasUserinfo) {
    blockNetwork = true;
    blockReason = 'URL contains credentials';
    add({
      key: 'url_embedded_credentials',
      title: 'Deceptive credentials inside the link',
      severity: 'critical',
      weight: 48,
      evidence: 'The URL embeds a username/password before the host, a trick used to make a malicious host look like a trusted one.',
      recommendedAction: 'Do not open the link. Type the organisation’s address manually.',
      category: 'phishing',
    });
  }
  evaluate();
  if (nonStandardPort) {
    blockNetwork = true;
    blockReason = 'non-standard port';
    add({
      key: 'nonstandard_port',
      title: 'Unusual network port',
      severity: 'medium',
      weight: 20,
      evidence: `The URL explicitly uses port ${parsed.port} instead of the standard 80/443.`,
      recommendedAction: 'Treat as suspicious; standard consumer sites do not require a custom port.',
      category: 'phishing',
    });
  }

  // IDN / homograph ---------------------------------------------------------
  evaluate();
  if (host.includes('xn--') || /[^\u0000-\u007f]/.test(parsed.href)) {
    add({
      key: 'internationalised_host',
      title: 'Look-alike international characters in the domain',
      severity: 'high',
      weight: 34,
      evidence: `The hostname ${host} uses Punycode/non-ASCII characters that can render as a trusted brand in the browser address bar.`,
      recommendedAction: 'Do not sign in. Navigate to the official site directly and check the domain character by character.',
      category: 'impersonation',
    });
  }

  // Brand impersonation / typosquatting -------------------------------------
  evaluate();
  const brandClaims = findBrandsInText(host.replace(/[-_.]/g, ' '));
  const lookalikeBrand = findBrandForHost(host);
  const matchedBrand = brandClaims[0] ?? lookalikeBrand;
  if (matchedBrand && !isOfficialDomain(host, matchedBrand)) {
    const officialLabel = (matchedBrand.domains[0] ?? '').split('.')[0] ?? '';
    const hostLabel = registrable.split('.')[0] ?? '';
    const distance = officialLabel ? levenshtein(hostLabel, officialLabel, 3) : 99;
    add({
      key: 'brand_impersonation_domain',
      title: 'Domain impersonates a known brand',
      severity: 'critical',
      weight: distance <= 2 ? 50 : 42,
      evidence: `The domain ${registrable} imitates ${matchedBrand.name} (official domain: ${matchedBrand.domains[0]}), with a ${distance <= 2 ? 'very similar' : 'brand-containing'} hostname.`,
      recommendedAction: 'Close the page and go to the official app or type the official domain yourself.',
      category: 'impersonation',
    });
  }

  // TLD / host complexity ---------------------------------------------------
  evaluate();
  const tld = registrable.split('.').pop() ?? '';
  if (SUSPICIOUS_TLDS.has(tld)) {
    add({
      key: 'suspicious_tld',
      title: 'Low-reputation top-level domain',
      severity: 'medium',
      weight: 18,
      evidence: `The domain ends in .${tld}, a TLD frequently used for short-lived phishing pages. This alone is not proof of fraud.`,
      recommendedAction: 'Verify the organisation independently before entering any information.',
      category: 'phishing',
    });
  }

  evaluate();
  const labelsAboveRegistrable = Math.max(0, host.split('.').length - registrable.split('.').length);
  if (labelsAboveRegistrable >= 3) {
    add({
      key: 'deep_subdomains',
      title: 'Excessive subdomains',
      severity: 'medium',
      weight: 16,
      evidence: `${labelsAboveRegistrable} subdomain levels are used before ${registrable}, a common way to bury a misleading brand name in the address.`,
      recommendedAction: 'Read the domain from right to left before trusting the page.',
      category: 'phishing',
    });
  }

  evaluate();
  if (host.length > 45 || (host.match(/-/g) ?? []).length >= 3) {
    add({
      key: 'complex_hostname',
      title: 'Unusually complex hostname',
      severity: 'low',
      weight: 10,
      evidence: `The hostname is ${host.length} characters long with ${(host.match(/-/g) ?? []).length} hyphens.`,
      recommendedAction: 'Treat unusual hostnames with caution and verify the official address.',
      category: 'phishing',
    });
  }

  // Path / query ------------------------------------------------------------
  evaluate();
  const pathAndQuery = `${parsed.pathname}${parsed.search}`;
  const harvestHits = HARVEST_KEYWORDS.filter((keyword) => pathAndQuery.toLowerCase().includes(keyword));
  if (harvestHits.length > 0) {
    add({
      key: 'credential_path_keywords',
      title: 'Credential-collection page pattern',
      severity: 'medium',
      weight: 22,
      evidence: `The path contains ${harvestHits.slice(0, 3).map((keyword) => `"${keyword}"`).join(', ')}, typical of fake login and KYC pages.`,
      recommendedAction: 'Never enter credentials after following a link. Open the official app instead.',
      category: 'phishing',
    });
  }

  evaluate();
  if (DANGEROUS_FILE_PATTERN.test(parsed.pathname) || DANGEROUS_FILE_PATTERN.test(parsed.search)) {
    add({
      key: 'dangerous_download',
      title: 'Link downloads an executable or archive',
      severity: 'critical',
      weight: 50,
      evidence: `The URL ends in an installable/archive file type (${parsed.pathname.slice(-24)}). This is how banking trojans are often delivered.`,
      recommendedAction: 'Do not download or install anything from this link.',
      category: 'phishing',
    });
  }

  evaluate();
  const encodedChars = (pathAndQuery.match(/%[0-9a-f]{2}/gi) ?? []).length;
  if (encodedChars >= 5) {
    add({
      key: 'encoded_path',
      title: 'Heavily encoded URL',
      severity: 'low',
      weight: 12,
      evidence: `The path/query contains ${encodedChars} percent-encoded characters, which can hide the real destination or payload.`,
      recommendedAction: 'Do not open the link. Ask the sender for a plain domain name instead.',
      category: 'phishing',
    });
  }

  evaluate();
  if (/(^|[?&])(url|redirect|redirect_uri|next|continue|target|dest|return|returnurl)=/i.test(parsed.search)) {
    add({
      key: 'redirect_parameter',
      title: 'Open-redirect style parameter',
      severity: 'low',
      weight: 10,
      evidence: `The query string contains a redirect parameter that can bounce you to another site (${parsed.search.slice(0, 80)}).`,
      recommendedAction: 'Do not follow the link; navigate directly to the organisation’s site.',
      category: 'phishing',
    });
  }

  evaluate();
  if (isShortenerHost(host)) {
    add({
      key: 'shortener_destination',
      title: 'Shortened link hides its destination',
      severity: 'medium',
      weight: 18,
      evidence: `${registrable} is a URL shortener, so the final destination is not visible before clicking.`,
      recommendedAction: 'Expand the link before visiting, or use the organisation’s official site.',
      category: 'phishing',
    });
  }

  evaluate();
  if (parsed.href.length > 180) {
    add({
      key: 'overlong_url',
      title: 'Unusually long URL',
      severity: 'low',
      weight: 8,
      evidence: `The URL is ${parsed.href.length} characters long, which is often used to bury suspicious parameters.`,
      recommendedAction: 'Shorten your view by checking the domain only, and verify it independently.',
      category: 'phishing',
    });
  }

  return {
    href: parsed.toString(),
    host,
    registrable,
    findings,
    categoryVotes,
    signalsEvaluated,
    blockNetwork,
    blockReason,
    limitations: [...limitations],
    isIpLiteral: ipLiteral,
    hasUserinfo,
    nonStandardPort,
  };
}
