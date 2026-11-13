import { findBrandsInText, isOfficialDomain, registrableDomain } from './brands';
import { stripHtml } from './extract';
import type { CategoryVotes, RawFinding } from './types';

export interface Mailbox {
  raw: string;
  address: string;
  displayName: string;
  domain: string;
}

export type AuthResultValue = 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'unknown';

export interface ParsedEmail {
  headers: Record<string, string[]>;
  from: Mailbox | null;
  replyTo: Mailbox | null;
  returnPath: Mailbox | null;
  subject: string;
  body: string;
  htmlBody: string | null;
  authentication: { spf: AuthResultValue; dkim: AuthResultValue; dmarc: AuthResultValue; source: string } | null;
  hasDkimSignature: boolean;
  hasAuthenticationHeaders: boolean;
  receivedHeaders: number;
  attachmentNames: string[];
}

function parseMailbox(value: string | undefined): Mailbox | null {
  if (!value) return null;
  const raw = value.trim();
  const angled = raw.match(/^(.*?)<([^<>\s]+@[^<>\s]+)>\s*$/);
  const address = (angled?.[2] ?? raw.match(/[^\s<>",;]+@[^\s<>",;]+/)?.[0] ?? '').trim().toLowerCase();
  if (!address || !address.includes('@')) return null;
  const displayName = (angled?.[1] ?? '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
  const domain = address.split('@')[1] ?? '';
  return { raw, address, displayName, domain };
}

const HEADER_LINE = /^[A-Za-z0-9-]{1,64}:\s?/;

/**
 * Parses pasted email text or an RFC 822 (.eml) message. This is deliberately a
 * conservative parser: unknown or malformed headers are reported as absent, not
 * interpreted.
 */
export function parseEmail(raw: string): ParsedEmail {
  const normalized = raw.replace(/\r\n/g, '\n');
  const firstBlank = normalized.indexOf('\n\n');
  const headerBlock = firstBlank > -1 ? normalized.slice(0, firstBlank) : '';
  const looksLikeHeaders = headerBlock.split('\n').slice(0, 30).some((line) => HEADER_LINE.test(line));
  const headers: Record<string, string[]> = {};
  let body = normalized;
  let htmlBody: string | null = null;

  if (looksLikeHeaders) {
    body = normalized.slice(firstBlank + 2);
    const unfolded: string[] = [];
    for (const line of headerBlock.split('\n')) {
      if (/^[ \t]/.test(line) && unfolded.length > 0) {
        unfolded[unfolded.length - 1] = `${unfolded[unfolded.length - 1]} ${line.trim()}`;
      } else {
        unfolded.push(line);
      }
    }
    for (const line of unfolded) {
      const separator = line.indexOf(':');
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();
      headers[key] = [...(headers[key] ?? []), value];
    }
  }

  if (/content-type:\s*text\/html/i.test(headerBlock) || /^\s*<(!doctype|html|div|table|p|body)/i.test(body)) {
    htmlBody = body;
  }

  const authHeader =
    headers['authentication-results']?.[0] ??
    headers['arc-authentication-results']?.[0] ??
    null;
  const receivedSpf = headers['received-spf']?.[0] ?? null;

  let authentication: ParsedEmail['authentication'] = null;
  if (authHeader || receivedSpf) {
    const source = authHeader ?? receivedSpf ?? '';
    const read = (mechanism: 'spf' | 'dkim' | 'dmarc'): AuthResultValue => {
      const match = source.match(new RegExp(`\\b${mechanism}\\s*=\\s*(pass|fail|softfail|neutral|none|permerror|temperror|policy)`, 'i'));
      if (!match?.[1]) return 'unknown';
      const value = match[1].toLowerCase();
      if (value === 'permerror' || value === 'temperror' || value === 'policy') return 'unknown';
      return value as AuthResultValue;
    };
    authentication = { spf: read('spf'), dkim: read('dkim'), dmarc: read('dmarc'), source: source.slice(0, 500) };
  }

  const plainBody = htmlBody ? stripHtml(htmlBody) : body;
  const attachmentNames = (headers['content-disposition'] ?? [])
    .map((value) => value.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)/i)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));

  return {
    headers,
    from: parseMailbox(headers.from?.[0]),
    replyTo: parseMailbox(headers['reply-to']?.[0]),
    returnPath: parseMailbox(headers['return-path']?.[0]),
    subject: (headers.subject?.[0] ?? '').slice(0, 500),
    body: plainBody.trim(),
    htmlBody,
    authentication,
    hasDkimSignature: Boolean(headers['dkim-signature']?.[0]),
    hasAuthenticationHeaders: Boolean(authHeader || receivedSpf || headers['dkim-signature']?.[0]),
    receivedHeaders: (headers.received ?? []).length,
    attachmentNames: Array.from(new Set(attachmentNames)),
  };
}

export interface EmailAnalysisResult {
  findings: RawFinding[];
  categoryVotes: CategoryVotes;
  signalsEvaluated: number;
  limitations: string[];
  parsed: ParsedEmail;
}

const FREE_MAIL_DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'proton.me', 'icloud.com'];

/** Header-focused analysis. Body rules are run separately by analyzeText. */
export function analyzeEmailHeaders(parsed: ParsedEmail): EmailAnalysisResult {
  const findings: RawFinding[] = [];
  const categoryVotes: CategoryVotes = {};
  const limitations = new Set<string>();
  let signalsEvaluated = 0;

  const add = (finding: Omit<RawFinding, 'source' | 'method' | 'observedAt'>) => {
    findings.push({
      ...finding,
      method: 'header_analysis',
      source: 'email_headers',
      observedAt: new Date().toISOString(),
    });
    if (finding.category) {
      categoryVotes[finding.category] = (categoryVotes[finding.category] ?? 0) + finding.weight;
    }
  };
  const evaluate = () => {
    signalsEvaluated += 1;
  };

  // Reply-To mismatch ------------------------------------------------------
  evaluate();
  if (parsed.from && parsed.replyTo) {
    const fromDomain = registrableDomain(parsed.from.domain);
    const replyDomain = registrableDomain(parsed.replyTo.domain);
    if (fromDomain !== replyDomain) {
      add({
        key: 'reply_to_mismatch',
        title: 'Replies are redirected to a different domain',
        severity: 'high',
        weight: 28,
        evidence: `The From domain is ${fromDomain} but Reply-To points to ${replyDomain} (${parsed.replyTo.address}). This is a common way to hide where a conversation is really going.`,
        recommendedAction: 'Do not reply. Contact the organisation using an address from its official website.',
        category: 'impersonation',
      });
    }
  }

  // Return-Path mismatch ---------------------------------------------------
  evaluate();
  if (parsed.from && parsed.returnPath) {
    if (registrableDomain(parsed.from.domain) !== registrableDomain(parsed.returnPath.domain)) {
      add({
        key: 'return_path_mismatch',
        title: 'Envelope sender differs from the From header',
        severity: 'medium',
        weight: 14,
        evidence: `Return-Path is ${registrableDomain(parsed.returnPath.domain)} while the visible From header is ${registrableDomain(parsed.from.domain)}. Some legitimate bulk mail does this, but combined with other signals it is suspicious.`,
        recommendedAction: 'Treat the sender as unverified and do not act on payment or credential requests.',
        category: 'phishing',
      });
    }
  }

  // Display-name impersonation --------------------------------------------
  evaluate();
  if (parsed.from) {
    const brands = findBrandsInText(parsed.from.displayName);
    const freeMail = FREE_MAIL_DOMAINS.includes(registrableDomain(parsed.from.domain));
    const claimingBrand = brands.find((brand) => !isOfficialDomain(parsed.from!.domain, brand));
    if (claimingBrand) {
      add({
        key: 'display_name_impersonation',
        title: 'Display name impersonates an organisation',
        severity: 'critical',
        weight: 44,
        evidence: `The sender name claims "${claimingBrand.name}" but the actual address is ${parsed.from.address}, which is not an official ${claimingBrand.name} domain.`,
        recommendedAction: 'Do not reply or click links. Reach the organisation through its official website or app.',
        category: 'impersonation',
      });
    } else if (freeMail && /(bank|support|security|billing|hr|recruit|payroll|government|tax|refund)/i.test(parsed.from.displayName)) {
      add({
        key: 'free_mail_sender_impersonation',
        title: 'Official-sounding sender on a free mailbox',
        severity: 'high',
        weight: 30,
        evidence: `The display name "${parsed.from.displayName.slice(0, 60)}" implies a department, but the address uses a free consumer mailbox (${parsed.from.domain}).`,
        recommendedAction: 'Verify the request through the organisation’s official channel.',
        category: 'impersonation',
      });
    }
  }

  // SPF / DKIM / DMARC ----------------------------------------------------
  evaluate();
  if (!parsed.hasAuthenticationHeaders) {
    // Absence is explicitly NOT treated as fraud (spec requirement).
    limitations.add(
      'No SPF/DKIM/DMARC result was present in the supplied headers. Many legitimate forwarded emails lose these headers, so their absence is not evidence of fraud.',
    );
  } else if (parsed.authentication) {
    const auth = parsed.authentication;
    if (auth.spf === 'fail' || auth.spf === 'softfail') {
      add({
        key: 'spf_failure',
        title: `SPF ${auth.spf}`,
        severity: auth.spf === 'fail' ? 'high' : 'medium',
        weight: auth.spf === 'fail' ? 32 : 18,
        evidence: `The receiving mail server recorded SPF=${auth.spf}, meaning the sending server was not authorised by the From domain. This is reported from the embedded header and can itself be forged in a hand-edited file.`,
        recommendedAction: 'Treat the sender as unverified. Do not click links or share information.',
        category: 'phishing',
      });
    }
    if (auth.dkim === 'fail') {
      add({
        key: 'dkim_failure',
        title: 'DKIM signature failed',
        severity: 'high',
        weight: 28,
        evidence: 'The receiving server recorded DKIM=fail, so the cryptographic signature on the message did not validate.',
        recommendedAction: 'Treat the message as unauthenticated and verify through another channel.',
        category: 'phishing',
      });
    }
    if (auth.dmarc === 'fail') {
      add({
        key: 'dmarc_failure',
        title: 'DMARC policy failed',
        severity: 'high',
        weight: 34,
        evidence: 'The receiving server recorded DMARC=fail, meaning the message did not pass the domain owner’s authentication policy.',
        recommendedAction: 'Do not act on the message. Report it as phishing.',
        category: 'phishing',
      });
    }
    if (parsed.hasDkimSignature && !parsed.headers['authentication-results']) {
      limitations.add('A DKIM-Signature header exists but no verification result was recorded; signature presence alone proves nothing.');
    }
  }

  // Subject manipulation ---------------------------------------------------
  evaluate();
  const subject = parsed.subject;
  const subjectFlags: string[] = [];
  if (/^\s*(re|fw|fwd)\s*:/i.test(subject) && parsed.receivedHeaders <= 1) {
    subjectFlags.push('fake reply/forward prefix');
  }
  if (subject.length > 0 && subject.replace(/[^A-Za-z]/g, '').length > 8) {
    const letters = subject.replace(/[^A-Za-z]/g, '');
    const caps = subject.replace(/[^A-Z]/g, '');
    if (caps.length / letters.length > 0.6) subjectFlags.push('mostly upper-case subject');
  }
  if (/(final notice|last warning|urgent action|account suspended|payment failed|verify now|immediate action)/i.test(subject)) {
    subjectFlags.push('alarmist wording');
  }
  if (subjectFlags.length > 0) {
    add({
      key: 'subject_manipulation',
      title: 'Manipulative subject line',
      severity: 'low',
      weight: 10,
      evidence: `The subject shows ${subjectFlags.join(', ')}: "${subject.slice(0, 80)}".`,
      recommendedAction: 'Judge the message by its content and sender, not the subject line.',
      category: 'phishing',
    });
  }

  // Attachment references --------------------------------------------------
  evaluate();
  const dangerousAttachment = parsed.attachmentNames.find((name) => /\.(apk|exe|scr|msi|bat|cmd|js|vbs|jar|zip|rar|7z|iso|img)$/i.test(name));
  if (dangerousAttachment || /(enable macros|enable editing|enable content|password[- ]protected (file|document))/i.test(parsed.body)) {
    add({
      key: 'email_dangerous_attachment',
      title: 'Dangerous attachment or macro request',
      severity: 'critical',
      weight: 46,
      evidence: dangerousAttachment
        ? `The message carries an attachment named "${dangerousAttachment.slice(0, 60)}", a file type commonly used to deliver malware.`
        : 'The message asks you to enable macros or open a password-protected document, a standard malware delivery technique.',
      recommendedAction: 'Do not open the attachment or enable macros. Delete the message and report it.',
      category: 'phishing',
    });
  }

  // Hidden HTML content ----------------------------------------------------
  evaluate();
  if (parsed.htmlBody && /display\s*:\s*none|font-size\s*:\s*0(px)?\s*;|visibility\s*:\s*hidden/i.test(parsed.htmlBody)) {
    add({
      key: 'hidden_html_content',
      title: 'Hidden content in the email',
      severity: 'medium',
      weight: 20,
      evidence: 'The HTML part contains hidden elements (display:none / zero font size), a technique used to slip text past spam filters.',
      recommendedAction: 'View the message as plain text or delete it without interacting.',
      category: 'phishing',
    });
  }

  limitations.add('Header analysis reflects the headers supplied. Forwarded or hand-edited emails may not contain the original routing information.');
  if (parsed.htmlBody) {
    limitations.add('Only the text of the HTML part was analysed; remote images, scripts and trackers were not loaded.');
  }

  return { findings, categoryVotes, signalsEvaluated, limitations: [...limitations], parsed };
}
