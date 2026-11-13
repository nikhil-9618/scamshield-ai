import type { ExtractedEntities } from '@scamshield/shared-types';
import { registrableDomain } from './brands';

const TLD_GROUP =
  'co\\.in|com|in|net|org|io|xyz|top|shop|site|online|info|biz|club|live|app|link|click|pro|vip|icu|cc|tk|ml|ga|cf|gq|ru|cn|ly|to|me|dev|bank|support|help|finance|sbs|cfd|buzz|rest|cam|monster|quest';

const URL_SOURCE = String.raw`https?:\/\/[^\s<>"'\`)}\]]+`;
const BARE_DOMAIN_SOURCE = String.raw`(?:^|[\s(>])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:${TLD_GROUP}))(?=[/\s?#),.!:]|$)`;
const EMAIL_SOURCE = String.raw`[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,190}\.[A-Z]{2,24}`;
const UPI_SOURCE = String.raw`\b[A-Za-z0-9._-]{2,64}@(?:oksbi|okhdfcbank|okicici|okaxis|ybl|ibl|axl|apl|paytm|upi|sbi|hdfcbank|icici|axisbank|kotak|yesbank|airtel)\b`;
const PHONE_SOURCE = String.raw`(?:\+?91[\s.-]?)?(?:[6-9]\d{9}|1[89]00[\s.-]?\d{3}[\s.-]?\d{4})`;
const SHORTENER_HOSTS = [
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'cutt.ly',
  'rb.gy',
  'shorturl.at',
  'rebrand.ly',
  't.ly',
  'tiny.cc',
  'wa.me',
  't.me',
  'chat.whatsapp.com',
];

const MAX_LIST = 25;

function uniqueBounded(values: string[], max = MAX_LIST): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= max) break;
  }
  return result;
}

export function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:!?'"`)\]}>]+$/g, '');
}

/** Accepts user input like `www.example.com/path` and normalises it to https. */
export function normalizeUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const direct = new RegExp(URL_SOURCE, 'gi');
  for (const match of text.matchAll(direct)) {
    urls.push(stripTrailingPunctuation(match[0]));
  }
  const bare = new RegExp(BARE_DOMAIN_SOURCE, 'gi');
  for (const match of text.matchAll(bare)) {
    const domain = match[1];
    if (!domain) continue;
    const startIndex = match.index ?? 0;
    const preceding = startIndex > 0 ? text.charAt(startIndex) : '';
    // Skip domains that are really the tail of an email address.
    if (preceding === '@') continue;
    const alreadyCovered = urls.some((url) => url.toLowerCase().includes(domain.toLowerCase()));
    if (!alreadyCovered) urls.push(`https://${domain}`);
  }
  return uniqueBounded(urls);
}

export function extractDomains(text: string, urls: string[]): string[] {
  const domains: string[] = [];
  for (const url of urls) {
    try {
      domains.push(registrableDomain(new URL(url).hostname));
    } catch {
      /* ignore malformed */
    }
  }
  const emailed = new RegExp(EMAIL_SOURCE, 'gi');
  for (const match of text.matchAll(emailed)) {
    const domain = match[0].split('@')[1];
    if (domain) domains.push(domain.toLowerCase());
  }
  return uniqueBounded(domains);
}

export function extractPhoneNumbers(text: string): string[] {
  const regex = new RegExp(PHONE_SOURCE, 'g');
  return uniqueBounded(
    Array.from(text.matchAll(regex), (match) => match[0].replace(/[\s.-]/g, '').replace(/^\+?91/, '+91 ').trim()),
  );
}

export function extractEmailAddresses(text: string): string[] {
  const regex = new RegExp(EMAIL_SOURCE, 'gi');
  return uniqueBounded(Array.from(text.matchAll(regex), (match) => match[0].toLowerCase()));
}

export function extractUpiIds(text: string): string[] {
  const regex = new RegExp(UPI_SOURCE, 'gi');
  const matches = Array.from(text.matchAll(regex), (match) => match[0]);
  // UPI handles can look like emails; exclude addresses with non-payment domains.
  return uniqueBounded(matches.filter((value) => !/\.(com|org|net|in)$/i.test(value)));
}

export function extractEntities(text: string): ExtractedEntities {
  const urls = extractUrls(text);
  return {
    urls,
    domains: extractDomains(text, urls),
    phoneNumbers: extractPhoneNumbers(text),
    emailAddresses: extractEmailAddresses(text),
    upiIds: extractUpiIds(text),
  };
}

export function isShortenerHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return SHORTENER_HOSTS.some((entry) => normalized === entry || normalized.endsWith(`.${entry}`));
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]{0,20000}?<\/script>/gi, ' ')
    .replace(/<style[\s\S]{0,20000}?<\/style>/gi, ' ')
    .replace(/<[^>]{1,2000}>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, ' ');
}

/**
 * Builds the stored preview: PII masked, control characters removed, capped.
 * The full payload is never persisted unless the user consented.
 */
export function buildPreview(text: string, maxLength = 280): string {
  const cleaned = text
    .replace(new RegExp(EMAIL_SOURCE, 'gi'), '[email]')
    .replace(new RegExp(UPI_SOURCE, 'gi'), '[upi]')
    .replace(new RegExp(PHONE_SOURCE, 'g'), '[number]')
    .replace(/\b\d{12,19}\b/g, '[number]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1)}…`;
}

export function hasObfuscation(text: string): { spaced: boolean; homoglyphs: boolean; zeroWidth: boolean } {
  const zeroWidth = /[\u200b-\u200f\u2060\ufeff]/.test(text);
  const spaced = /(?:\b[a-zA-Z]\s){6,}[a-zA-Z]\b/.test(text);
  // Latin words containing Cyrillic/Greek characters used as lookalikes.
  const homoglyphs = /[a-zA-Z]{2,}[\u0400-\u04ff\u0370-\u03ff][a-zA-Z]{1,}|[\u0400-\u04ff\u0370-\u03ff][a-zA-Z]{2,}/.test(text);
  return { spaced, homoglyphs, zeroWidth };
}

export function countMatches(text: string, phrases: string[]): string[] {
  const haystack = text.toLowerCase();
  return phrases.filter((phrase) => haystack.includes(phrase.toLowerCase()));
}
