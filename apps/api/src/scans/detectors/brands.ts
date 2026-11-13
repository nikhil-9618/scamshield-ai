import { getDomain } from 'tldts';

export interface BrandDefinition {
  name: string;
  /** Registrable domains owned by the organisation. */
  domains: string[];
  /** Lower-case aliases used in text. */
  aliases: string[];
}

/**
 * A curated list of commonly impersonated organisations in India. Used only to
 * detect *mismatches* between a claimed identity and the actual link/domain —
 * never as proof that a link is genuine.
 */
export const BRANDS: BrandDefinition[] = [
  { name: 'State Bank of India', domains: ['sbi.co.in', 'onlinesbi.sbi', 'sbiyono.sbi'], aliases: ['sbi', 'state bank of india', 'yono'] },
  { name: 'HDFC Bank', domains: ['hdfcbank.com'], aliases: ['hdfc', 'hdfc bank'] },
  { name: 'ICICI Bank', domains: ['icicibank.com'], aliases: ['icici', 'icici bank'] },
  { name: 'Axis Bank', domains: ['axisbank.com'], aliases: ['axis bank', 'axis'] },
  { name: 'Kotak Mahindra Bank', domains: ['kotak.com'], aliases: ['kotak', 'kotak bank'] },
  { name: 'Punjab National Bank', domains: ['pnbindia.in'], aliases: ['pnb', 'punjab national bank'] },
  { name: 'Bank of Baroda', domains: ['bankofbaroda.in'], aliases: ['bob', 'bank of baroda'] },
  { name: 'Canara Bank', domains: ['canarabank.com'], aliases: ['canara bank', 'canara'] },
  { name: 'Union Bank of India', domains: ['unionbankofindia.co.in'], aliases: ['union bank'] },
  { name: 'India Post', domains: ['indiapost.gov.in'], aliases: ['india post', 'indiapost'] },
  { name: 'Amazon', domains: ['amazon.in', 'amazon.com'], aliases: ['amazon'] },
  { name: 'Flipkart', domains: ['flipkart.com'], aliases: ['flipkart'] },
  { name: 'Paytm', domains: ['paytm.com'], aliases: ['paytm'] },
  { name: 'PhonePe', domains: ['phonepe.com'], aliases: ['phonepe'] },
  { name: 'Google Pay', domains: ['google.com', 'pay.google.com'], aliases: ['google pay', 'gpay'] },
  { name: 'Netflix', domains: ['netflix.com'], aliases: ['netflix'] },
  { name: 'IRCTC', domains: ['irctc.co.in'], aliases: ['irctc'] },
  { name: 'Income Tax Department', domains: ['incometax.gov.in'], aliases: ['income tax department', 'incometax'] },
  { name: 'EPFO', domains: ['epfindia.gov.in'], aliases: ['epfo', 'epf india'] },
  { name: 'Reserve Bank of India', domains: ['rbi.org.in'], aliases: ['rbi', 'reserve bank'] },
  { name: 'NPCI', domains: ['npci.org.in'], aliases: ['npci', 'bhim'] },
  { name: 'Customs / Indian Customs', domains: ['icegate.gov.in', 'cbic.gov.in'], aliases: ['indian customs', 'customs department'] },
];

export function registrableDomain(host: string): string {
  return getDomain(host.toLowerCase()) ?? host.toLowerCase();
}

export function findBrandsInText(text: string): BrandDefinition[] {
  const haystack = ` ${text.toLowerCase()} `;
  return BRANDS.filter((brand) =>
    brand.aliases.some((alias) => {
      if (alias.length <= 3) {
        return new RegExp(`(^|[^a-z0-9])${alias}([^a-z0-9]|$)`, 'i').test(haystack);
      }
      return haystack.includes(alias);
    }),
  );
}

export function isOfficialDomain(host: string, brand: BrandDefinition): boolean {
  const domain = registrableDomain(host);
  return brand.domains.some((official) => domain === official || domain.endsWith(`.${official}`));
}

export function findBrandForHost(host: string): BrandDefinition | null {
  const domain = registrableDomain(host);
  for (const brand of BRANDS) {
    if (brand.domains.some((official) => domain === official || domain.endsWith(`.${official}`))) {
      return brand;
    }
    const label = domain.split('.')[0] ?? '';
    for (const official of brand.domains) {
      const officialLabel = official.split('.')[0] ?? '';
      if (officialLabel.length >= 4 && distanceAtMost(label, officialLabel, 2) && label !== officialLabel) {
        return brand;
      }
    }
  }
  return null;
}

/** Bounded Levenshtein distance (returns limit+1 when exceeded). */
export function distanceAtMost(a: string, b: string, limit: number): boolean {
  return levenshtein(a, b, limit) <= limit;
}

export function levenshtein(a: string, b: string, limit = 3): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0]!;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]!;
  }
  return previous[b.length]!;
}
