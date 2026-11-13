import type { ExtractedEntities, FindingSeverity } from '@scamshield/shared-types';
import { extractEntities, hasObfuscation, hostOf, isShortenerHost } from './extract';
import { findBrandsInText, isOfficialDomain } from './brands';
import type { CategoryVotes, RawFinding } from './types';

export interface TextAnalyzerOptions {
  entities?: ExtractedEntities;
  scanType?: 'message' | 'email' | 'screenshot' | 'qr';
}

export interface TextAnalyzerResult {
  findings: RawFinding[];
  categoryVotes: CategoryVotes;
  signalsEvaluated: number;
  entities: ExtractedEntities;
  limitations: string[];
}

const ACTIONS = {
  verify: 'Verify the organisation using a phone number or website you find yourself — never one supplied in the message.',
  noSecrets: 'Never share OTPs, PINs, CVVs, passwords or card details. No genuine bank, courier or government office asks for them.',
  noMoney: 'Do not transfer money, pay a fee or scan a payment QR code until the request is independently verified.',
  noInstall: 'Do not install apps or open attachments from unexpected messages.',
  block: 'Stop responding, block the sender and report the message.',
  slowDown: 'Slow down and check with someone you trust before acting.',
} as const;

function matches(text: string, phrases: string[]): string[] {
  const haystack = text.toLowerCase();
  return phrases.filter((phrase) => haystack.includes(phrase));
}

function quote(values: string[], max = 3): string {
  return values
    .slice(0, max)
    .map((value) => `"${value.replace(/\s+/g, ' ').slice(0, 70)}"`)
    .join(', ');
}

function hasPattern(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

/**
 * Deterministic message rules. Every finding states the phrase/pattern that
 * triggered it and the action the user should take, so the result is auditable.
 */
export function analyzeText(text: string, options: TextAnalyzerOptions = {}): TextAnalyzerResult {
  const normalized = text.replace(/\r\n/g, '\n');
  const lower = normalized.toLowerCase();
  const entities = options.entities ?? extractEntities(normalized);
  const findings: RawFinding[] = [];
  const categoryVotes: CategoryVotes = {};
  const limitations = new Set<string>();
  let signalsEvaluated = 0;

  const add = (finding: Omit<RawFinding, 'source' | 'method' | 'observedAt'> & { method?: RawFinding['method'] }) => {
    findings.push({
      ...finding,
      method: finding.method ?? 'rule',
      source: 'scamshield_rules',
      observedAt: new Date().toISOString(),
    });
    if (finding.category) {
      categoryVotes[finding.category] = (categoryVotes[finding.category] ?? 0) + finding.weight;
    }
  };
  const evaluate = () => {
    signalsEvaluated += 1;
  };

  // 1. Urgency / pressure -----------------------------------------------------
  evaluate();
  const urgency = matches(lower, [
    'immediately',
    'urgent',
    'urgently',
    'within 24 hours',
    'within 24 hrs',
    'within 2 hours',
    'last chance',
    'act now',
    'expires today',
    'expire today',
    'account will be blocked',
    'account blocked',
    'immediate action',
    'right now',
    'time is running out',
    'final warning',
    'turant',
    'jaldi',
    'abhi',
  ]);
  if (urgency.length > 0) {
    add({
      key: 'urgency_pressure',
      title: 'Urgency pressure',
      severity: 'medium',
      weight: 14,
      evidence: `Uses time-limited, high-pressure wording: ${quote(urgency)}.`,
      recommendedAction: ACTIONS.verify,
    });
  }

  // 2. Upfront payment --------------------------------------------------------
  evaluate();
  const feeTerms = matches(lower, [
    'registration fee',
    'security deposit',
    'joining fee',
    'processing fee',
    'activation fee',
    'refundable deposit',
    'training fee',
    'documentation fee',
    'courier fee',
    'customs duty',
    'clearance fee',
    'handling fee',
    'delivery fee',
    'verification fee',
    'registration charge',
  ]);
  const payVerbs = matches(lower, ['pay ', 'payment', 'transfer', 'send money', 'deposit', 'scan this qr', 'scan the qr', 'remit']);
  if (feeTerms.length > 0) {
    add({
      key: feeTerms.some((term) => term.includes('courier') || term.includes('customs') || term.includes('delivery'))
        ? 'courier_fee_request'
        : 'upfront_payment_request',
      title: 'Upfront payment requested',
      severity: 'high',
      weight: payVerbs.length > 0 ? 34 : 22,
      evidence: `Asks for money before delivering anything: ${quote(feeTerms)}${payVerbs.length > 0 ? ` with payment instruction ${quote(payVerbs, 2)}` : ''}.`,
      recommendedAction: ACTIONS.noMoney,
      category: 'payment_fraud',
    });
  }

  // 3. Credential / OTP harvesting -------------------------------------------
  evaluate();
  const secretTerms = matches(lower, [
    'otp',
    'one-time password',
    'one time password',
    'upi pin',
    'mpin',
    'cvv',
    'card number',
    'net banking password',
    'internet banking password',
    'password',
    'atm pin',
    'aadhaar number',
    'aadhaar card',
    'pan card number',
    'security code',
  ]);
  // A mention of "OTP" is normal in legitimate alerts; only an actual request
  // for the secret counts. This avoids turning every genuine OTP notification
  // into a critical finding.
  const secretRequests = matches(lower, [
    'share your otp',
    'share the otp',
    'share otp',
    'send your otp',
    'send the otp',
    'send otp',
    'provide your otp',
    'provide the otp',
    'forward the otp',
    'forward your otp',
    'tell me the otp',
    'read out the otp',
    'otp to our',
    'otp with our',
    'reply with the otp',
    'reply with otp',
    'whatsapp the otp',
    'share your password',
    'send your password',
    'share your card',
    'share card details',
    'send your card',
    'send card details',
    'share your cvv',
    'send your cvv',
    'share your upi pin',
    'enter your upi pin',
    'share your pin',
    'share your mpin',
    'enter your card number',
    'enter your net banking',
    'send your aadhaar',
    'share your aadhaar',
    'send your pan',
    'share your pan',
    'share the code',
    'send the code',
    'read the code',
  ]);
  const secretsDiscouraged = matches(lower, [
    'do not share',
    'never share',
    "don't share",
    'dont share',
    'do not disclose',
    'never disclose',
  ]);
  if (secretRequests.length > 0 || (secretTerms.length > 0 && payVerbs.length > 0 && secretsDiscouraged.length === 0)) {
    const requestEvidence = secretRequests.length > 0 ? secretRequests : secretTerms;
    add({
      key: 'credential_request',
      title: 'Requests secret credentials',
      severity: 'critical',
      weight: 58,
      evidence: `Asks for information that grants access to money or accounts: ${quote(requestEvidence)}.`,
      recommendedAction: ACTIONS.noSecrets,
      category: secretTerms.some((term) => term.includes('aadhaar') || term.includes('pan'))
        ? 'kyc_fraud'
        : 'phishing',
    });
  }

  // 4. KYC + account blocking -------------------------------------------------
  evaluate();
  const kycTerms = matches(lower, ['kyc', 're-kyc', 'know your customer', 'update your kyc', 'complete your kyc', 'pan link', 'link your pan', 'aadhaar link', 're-verify']);
  const blockTerms = matches(lower, [
    'account will be blocked',
    'account blocked',
    'account suspended',
    'suspended',
    'deactivated',
    'frozen',
    'services will be stopped',
    'account will be closed',
  ]);
  if (kycTerms.length > 0 && (blockTerms.length > 0 || entities.urls.length > 0)) {
    add({
      key: 'kyc_impersonation',
      title: 'Fake KYC / account-blocking pattern',
      severity: 'high',
      weight: blockTerms.length > 0 ? 38 : 24,
      evidence: `Combines KYC language (${quote(kycTerms)}) with ${blockTerms.length > 0 ? `an account-blocking threat (${quote(blockTerms, 2)})` : 'a link'} — the standard fake-bank-KYC pattern.`,
      recommendedAction: 'Check your account only through your bank’s official app. Banks do not complete KYC over SMS links.',
      category: 'kyc_fraud',
    });
  }

  // 5. Brand claims vs actual links ------------------------------------------
  evaluate();
  const brands = findBrandsInText(normalized);
  if (brands.length > 0) {
    const mismatched: Array<{ brand: string; host: string; official: string }> = [];
    for (const url of entities.urls) {
      const host = hostOf(url);
      if (!host) continue;
      for (const brand of brands) {
        if (!isOfficialDomain(host, brand)) {
          mismatched.push({ brand: brand.name, host, official: brand.domains[0] ?? '' });
        }
      }
    }
    if (mismatched.length > 0) {
      const first = mismatched[0]!;
      add({
        key: 'brand_link_mismatch',
        title: 'Claimed brand does not match the link',
        severity: 'critical',
        weight: 42,
        evidence: `Claims to be ${first.brand} but links to ${first.host}, which is not an official domain (${first.official}).`,
        recommendedAction: ACTIONS.verify,
        category: 'impersonation',
      });
    } else if (secretRequests.length > 0 || feeTerms.length > 0 || kycTerms.length > 0 || blockTerms.length > 0) {
      add({
        key: 'brand_impersonation_context',
        title: 'Bank/brand impersonation context',
        severity: 'medium',
        weight: 18,
        evidence: `Invokes ${brands.slice(0, 2).map((brand) => brand.name).join(' and ')} together with a money or credential request. Pasted messages carry no verified sender identity.`,
        recommendedAction: ACTIONS.verify,
        category: 'impersonation',
      });
    }
  }

  // 6. Courier / parcel -------------------------------------------------------
  evaluate();
  const courierTerms = matches(lower, [
    'parcel',
    'courier',
    'shipment',
    'delivery failed',
    'delivery attempt',
    'consignment',
    'india post',
    'dtdc',
    'blue dart',
    'delhivery',
    'fedex',
    'dhl',
    'tracking number',
  ]);
  if (courierTerms.length > 0 && (feeTerms.length > 0 || entities.urls.length > 0 || blockTerms.length > 0)) {
    add({
      key: 'courier_scam_pattern',
      title: 'Courier / parcel scam pattern',
      severity: 'high',
      weight: 28,
      evidence: `Uses parcel or delivery language (${quote(courierTerms)}) together with a fee, threat or link.`,
      recommendedAction: 'Track parcels only on the courier’s official app/website. Do not pay “customs” or “redelivery” fees from a text link.',
      category: 'courier_scam',
    });
  }

  // 7. Fake jobs / internships ------------------------------------------------
  evaluate();
  const jobTerms = matches(lower, [
    'work from home',
    'work-from-home',
    'part time job',
    'part-time job',
    'part time',
    'data entry',
    'typing job',
    'online job',
    'internship',
    'hiring',
    'recruiter',
    'hr team',
    'hr manager',
    'no experience',
    'fresher',
    'earn from home',
    'daily payout',
    'daily payment',
    'copy paste job',
    'form filling',
    'ad posting',
  ]);
  const jobMoney = matches(lower, ['earn', 'salary', 'per day', 'per month', 'income', 'payout', 'stipend']);
  const moneyAmount = /(?:₹|rs\.?|inr)\s?[\d,]{3,}/i.test(normalized);
  if (jobTerms.length > 0 && (jobMoney.length > 0 || moneyAmount)) {
    add({
      key: 'fake_job_offer',
      title: 'Unrealistic job / internship offer',
      severity: 'high',
      weight: feeTerms.length > 0 || entities.urls.some((url) => isShortenerHost(hostOf(url) ?? '')) ? 38 : 26,
      evidence: `Job-offer language (${quote(jobTerms)}) combined with an income promise${moneyAmount ? ` (${(normalized.match(/(?:₹|rs\.?|inr)\s?[\d,]{3,}/i)?.[0] ?? '').slice(0, 24)})` : ''}${feeTerms.length > 0 ? ' and an upfront fee request' : ''}.`,
      recommendedAction: 'No legitimate employer charges a candidate to join. Verify the company on its official careers page and never pay a “registration” or “training” fee.',
      category: 'fake_job',
    });
  }
  evaluate();
  if (moneyAmount && matches(lower, ['guaranteed', 'assured', 'no experience', 'instant joining', 'daily']).length > 0 && jobTerms.length === 0) {
    add({
      key: 'unrealistic_earnings',
      title: 'Unrealistic earnings claim',
      severity: 'medium',
      weight: 22,
      evidence: `Promises specific earnings (${(normalized.match(/(?:₹|rs\.?|inr)\s?[\d,]{3,}/i)?.[0] ?? 'amount').slice(0, 24)}) with language like ${quote(matches(lower, ['guaranteed', 'assured', 'no experience', 'instant joining', 'daily']), 2)}.`,
      recommendedAction: 'Compare the offer with official salary data and never pay to receive income.',
      category: 'fake_job',
    });
  }

  // 8. Lottery / prize --------------------------------------------------------
  evaluate();
  const prizeTerms = matches(lower, ['you have won', 'congratulations', 'winner', 'lottery', 'lucky draw', 'prize', 'gift card', 'cash reward', 'selected lucky customer']);
  if (prizeTerms.length > 0 && (feeTerms.length > 0 || entities.urls.length > 0)) {
    add({
      key: 'lottery_prize_bait',
      title: 'Prize or lottery bait',
      severity: 'high',
      weight: 26,
      evidence: `Claims a prize or win (${quote(prizeTerms)}) and asks you to act or pay to release it.`,
      recommendedAction: 'You cannot win a lottery you never entered. Never pay a fee to claim a prize.',
      category: 'lottery_prize',
    });
  }

  // 9. Government scheme ------------------------------------------------------
  evaluate();
  const schemeTerms = matches(lower, [
    'yojana',
    'government scheme',
    'govt scheme',
    'subsidy',
    'government grant',
    'pm kisan',
    'ayushman',
    'free laptop',
    'scholarship',
    'ration card',
    'government benefit',
    'welfare scheme',
  ]);
  if (schemeTerms.length > 0 && (feeTerms.length > 0 || entities.urls.length > 0 || secretRequests.length > 0)) {
    add({
      key: 'government_scheme_bait',
      title: 'Fake government scheme pattern',
      severity: 'high',
      weight: 30,
      evidence: `References a government benefit (${quote(schemeTerms)}) while asking for a fee, link click or personal data.`,
      recommendedAction: 'Apply only through the official government portal (for example a .gov.in site) reached independently.',
      category: 'government_scheme',
    });
  }

  // 10. Legal / account threats ----------------------------------------------
  evaluate();
  const legalTerms = matches(lower, [
    'legal action',
    'fir',
    'police complaint',
    'court notice',
    'legal notice',
    'penalty',
    'fine of',
    'cyber cell',
    'case will be filed',
  ]);
  if (legalTerms.length > 0) {
    add({
      key: 'legal_threat',
      title: 'Legal or police threat',
      severity: 'medium',
      weight: 20,
      evidence: `Uses legal or police threats to create fear: ${quote(legalTerms)}.`,
      recommendedAction: 'Police and courts do not demand instant payment over messaging apps. Verify any notice independently.',
      category: 'impersonation',
    });
  }

  // 11. Fake customer support ------------------------------------------------
  evaluate();
  const supportTerms = matches(lower, ['customer care', 'customer support', 'helpline', 'toll free', 'support number', 'call this number', 'call us on']);
  const remoteTools = matches(lower, ['anydesk', 'teamviewer', 'quick support', 'screen sharing', 'screen share', 'remote access', 'rustdesk']);
  if (remoteTools.length > 0) {
    add({
      key: 'remote_access_request',
      title: 'Remote-access tool requested',
      severity: 'critical',
      weight: 52,
      evidence: `Mentions remote-control software (${quote(remoteTools)}). Anyone with remote access can read your screen and move money from your accounts.`,
      recommendedAction: 'Never install remote-access apps for someone who contacted you. Hang up and call the organisation’s official number.',
      category: 'fake_support',
    });
  } else if (supportTerms.length > 0) {
    add({
      key: 'unofficial_support_contact',
      title: 'Unofficial support contact',
      severity: 'high',
      weight: 28,
      evidence: `Directs you to a customer-care contact (${quote(supportTerms)}) supplied inside the message, which may belong to a scammer rather than the company.`,
      recommendedAction: 'Find support numbers on the company’s official website or app, not from a message.',
      category: 'fake_support',
    });
  }

  // 12. Secrecy ---------------------------------------------------------------
  evaluate();
  const secrecy = matches(lower, [
    'do not tell anyone',
    'don’t tell anyone',
    "don't tell anyone",
    'keep this confidential',
    'do not inform',
    'don’t inform',
    "don't inform",
    'between us',
    'do not share this with',
  ]);
  if (secrecy.length > 0) {
    add({
      key: 'secrecy_pressure',
      title: 'Pressure to keep the request secret',
      severity: 'high',
      weight: 30,
      evidence: `Asks you to hide the request from others: ${quote(secrecy)}. Genuine support staff and recruiters never ask this.`,
      recommendedAction: 'Tell someone you trust immediately. Isolation is a core tactic of fraud.',
      category: 'impersonation',
    });
  }

  // 13. Investment fraud ------------------------------------------------------
  evaluate();
  const investmentTerms = matches(lower, [
    'guaranteed returns',
    'guaranteed profit',
    'assured returns',
    'double your money',
    'profit guaranteed',
    'trading group',
    'crypto investment',
    'forex trading',
    'sure shot',
    'risk free investment',
    'daily profit',
    'portfolio management',
  ]);
  if (investmentTerms.length > 0) {
    add({
      key: 'investment_lure',
      title: 'Investment-fraud pattern',
      severity: 'high',
      weight: 38,
      evidence: `Promises unusually safe or high returns: ${quote(investmentTerms)}.`,
      recommendedAction: 'Guaranteed high returns are a classic fraud signal. Check adviser registrations with SEBI and never send funds to personal accounts.',
      category: 'investment_fraud',
    });
  }

  // 14. Link structure signals ------------------------------------------------
  evaluate();
  const shorteners = entities.urls.map((url) => hostOf(url)).filter((host): host is string => Boolean(host && isShortenerHost(host)));
  if (shorteners.length > 0) {
    add({
      key: 'shortened_link',
      title: 'Link destination is hidden',
      severity: 'medium',
      weight: 18,
      evidence: `Uses a link shortener (${Array.from(new Set(shorteners)).slice(0, 2).join(', ')}) that hides the real destination.`,
      recommendedAction: 'Expand the link with a link-preview tool, or open the organisation’s site directly. Never sign in through a shortened link.',
      category: 'phishing',
    });
  }

  evaluate();
  const credentialLink = entities.urls.find((url) => {
    const host = hostOf(url);
    if (!host) return false;
    if (brands.some((brand) => isOfficialDomain(host, brand))) return false;
    let path = '';
    try {
      const parsed = new URL(url);
      path = `${parsed.hostname}${parsed.pathname}${parsed.search}`;
    } catch {
      return false;
    }
    return /(login|signin|sign-in|verify|verification|kyc|otp|password|secure|unlock|account-update|update-account|claim|refund)/i.test(path);
  });
  if (credentialLink) {
    add({
      key: 'credential_harvesting_link',
      title: 'Link looks designed to collect credentials',
      severity: 'high',
      weight: 30,
      evidence: `A link contains sign-in/KYC keywords on a domain that is not the claimed organisation: ${credentialLink.slice(0, 120)}.`,
      recommendedAction: ACTIONS.verify,
      category: 'phishing',
    });
  }

  // 15. Attachments / installs ------------------------------------------------
  evaluate();
  const dangerousExtensions = [
    '.apk',
    '.exe',
    '.scr',
    '.msi',
    '.bat',
    '.cmd',
    '.js',
    '.vbs',
    '.jar',
    '.zip',
    '.rar',
    '.7z',
    'enable macros',
    'enable editing',
    'enable content',
  ].filter((extension) => lower.includes(extension));
  if (dangerousExtensions.length > 0) {
    add({
      key: 'dangerous_attachment',
      title: 'Potentially dangerous attachment or install',
      severity: 'critical',
      weight: 44,
      evidence: `Refers to an installable or macro-enabled file (${quote(dangerousExtensions)}). Installing it can give an attacker control of your device.`,
      recommendedAction: ACTIONS.noInstall,
      category: 'phishing',
    });
  }

  // 16. UPI / QR payment ------------------------------------------------------
  evaluate();
  if (entities.upiIds.length > 0) {
    add({
      key: 'upi_identifier',
      title: 'UPI payment identifier present',
      severity: 'medium',
      weight: 16,
      evidence: `Contains a UPI payment address (${entities.upiIds[0]}). UPI transfers are immediate and generally irreversible.`,
      recommendedAction: 'Send money only to people you have verified. Check the payee name in your UPI app before confirming.',
      category: 'upi_scam',
    });
  }
  evaluate();
  const qrTerms = matches(lower, ['scan this qr', 'scan the qr', 'scan qr', 'qr code', 'qr scan']);
  if (qrTerms.length > 0 && (matches(lower, ['receive', 'refund', 'payment', 'pay', 'money', 'credit']).length > 0 || entities.upiIds.length > 0)) {
    add({
      key: 'qr_payment_pressure',
      title: 'QR code used for a payment request',
      severity: 'high',
      weight: options.scanType === 'qr' ? 36 : 30,
      evidence: `Uses a QR code in a payment context (${quote(qrTerms)}). Scanning a QR code can only send money from your account — it never receives money for you.`,
      recommendedAction: 'Never scan a QR code to “receive” a payment or refund. Check the payee name before approving any UPI request.',
      category: 'qr_scam',
    });
  }

  // 17. Refund bait -----------------------------------------------------------
  evaluate();
  const refundTerms = matches(lower, ['refund', 'reverse the transaction', 'failed transaction', 'money back', 'cashback pending']);
  if (refundTerms.length > 0 && matches(lower, ['share', 'link', 'otp', 'call', 'account number', 'card']).length > 0) {
    add({
      key: 'refund_bait',
      title: 'Refund bait',
      severity: 'high',
      weight: 30,
      evidence: `Offers a refund (${quote(refundTerms)}) while asking you to share details, click a link or call a number.`,
      recommendedAction: 'Refunds arrive in the original payment method automatically. Never share account details or approve a collect request for a refund.',
      category: 'payment_fraud',
    });
  }

  // 18. Reachability / channel signals ---------------------------------------
  evaluate();
  const chatHandles = matches(lower, ['whatsapp', 'telegram', 't.me/', 'wa.me/', 'dm me', 'direct message']);
  if (chatHandles.length > 0 && (jobTerms.length > 0 || supportTerms.length > 0 || investmentTerms.length > 0)) {
    add({
      key: 'unofficial_channel',
      title: 'Moves the conversation to a private channel',
      severity: 'medium',
      weight: 18,
      evidence: `Pushes the conversation to a personal messaging channel (${quote(chatHandles)}), which is hard to verify or audit.`,
      recommendedAction: 'Keep conversations on the organisation’s official channels until the identity is verified.',
      category: jobTerms.length > 0 ? 'fake_job' : 'impersonation',
    });
  }

  // 19. Obfuscation / formatting ---------------------------------------------
  evaluate();
  const obfuscation = hasObfuscation(normalized);
  if (obfuscation.spaced || obfuscation.homoglyphs) {
    add({
      key: 'text_obfuscation',
      title: 'Obfuscated text',
      severity: 'medium',
      weight: 16,
      evidence: `Contains ${obfuscation.spaced ? 'spaced-out characters' : 'mixed Unicode look-alike characters'} intended to slip past filters.`,
      recommendedAction: 'Treat heavily obfuscated messages as suspicious and report them.',
      category: 'phishing',
    });
  }
  if (obfuscation.zeroWidth) {
    add({
      key: 'zero_width_characters',
      title: 'Hidden zero-width characters',
      severity: 'low',
      weight: 10,
      evidence: 'Contains invisible zero-width characters, a common filter-evasion trick in scam messages.',
      recommendedAction: 'Copy the visible text into a plain-text editor before trusting it, and treat the sender as suspicious.',
      category: 'phishing',
    });
  }

  evaluate();
  const letters = normalized.replace(/[^a-zA-Z]/g, '');
  const upper = normalized.replace(/[^A-Z]/g, '');
  const capsRatio = letters.length >= 40 ? upper.length / letters.length : 0;
  if (capsRatio > 0.55 || /!{3,}|\?{4,}/.test(normalized)) {
    add({
      key: 'formatting_anomaly',
      title: 'Manipulative formatting',
      severity: 'low',
      weight: 8,
      evidence: `${capsRatio > 0.55 ? `${Math.round(capsRatio * 100)}% of letters are upper case` : 'Repeated punctuation'}, commonly used to create alarm.`,
      recommendedAction: ACTIONS.slowDown,
    });
  }

  if (entities.urls.length > 0) {
    limitations.add('Links in the content were checked with structural and reputation signals; the destination page itself was not interacted with.');
  }
  limitations.add('A pasted message cannot verify who really sent it: sender numbers and names can be spoofed.');

  return {
    findings: findings.slice(0, 25),
    categoryVotes,
    signalsEvaluated,
    entities,
    limitations: [...limitations],
  };
}

export function severityRank(severity: FindingSeverity): number {
  return ['info', 'low', 'medium', 'high', 'critical'].indexOf(severity);
}

export function isRulePattern(text: string, pattern: RegExp): boolean {
  return hasPattern(text, pattern);
}
