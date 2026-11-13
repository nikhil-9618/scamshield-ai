import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { loadEnv } from '../../common/config/env';
import type { RiskLevel } from '@scamshield/shared-types';

export interface ProviderVerdict {
  provider: string;
  status: 'hit' | 'clean' | 'unknown' | 'disabled' | 'error';
  malicious: boolean;
  suspicious: boolean;
  detail: string;
  categories: string[];
  latencyMs: number;
  domainAgeDays?: number;
}

interface Provider {
  id: string;
  label: string;
  isConfigured(): boolean;
  lookup(url: string, hostname: string): Promise<ProviderVerdict>;
}

const TIMEOUT_FALLBACK = 4000;

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function base64Url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function daysSince(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return undefined;
  return Math.max(0, Math.round((Date.now() - time) / 86_400_000));
}

export class ThreatIntelProviders {
  private readonly env = loadEnv();
  private readonly logger = new Logger(ThreatIntelProviders.name);
  readonly providers: Provider[];

  constructor(private readonly prisma: PrismaService) {
    this.providers = [
      this.safeBrowsing(),
      this.virusTotal(),
      this.urlhaus(),
      this.phishTank(),
      this.localRegistry(),
      this.devFixtures(),
    ];
  }

  private safeBrowsing(): Provider {
    return {
      id: 'google_safe_browsing',
      label: 'Google Safe Browsing',
      isConfigured: () => Boolean(this.env.GOOGLE_SAFE_BROWSING_API_KEY),
      lookup: async (url) => {
        const started = Date.now();
        const response = await fetch(
          `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(this.env.GOOGLE_SAFE_BROWSING_API_KEY!)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal: AbortSignal.timeout(this.env.THREAT_INTEL_TIMEOUT_MS || TIMEOUT_FALLBACK),
            body: JSON.stringify({
              client: { clientId: 'scamshield-ai', clientVersion: '1.0.0' },
              threatInfo: {
                threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
                platformTypes: ['ANY_PLATFORM'],
                threatEntryTypes: ['URL'],
                threatEntries: [{ url }],
              },
            }),
          },
        );
        const latencyMs = Date.now() - started;
        if (!response.ok) throw new Error(`Safe Browsing HTTP ${response.status}`);
        const body = (await safeJson(response)) as { matches?: Array<{ threatType?: string }> } | null;
        const matches = body?.matches ?? [];
        return {
          provider: 'Google Safe Browsing',
          status: matches.length > 0 ? 'hit' : 'clean',
          malicious: matches.length > 0,
          suspicious: matches.length > 0,
          detail:
            matches.length > 0
              ? `Google Safe Browsing matched this URL: ${matches.map((match) => match.threatType).filter(Boolean).join(', ')}.`
              : 'No match in Google Safe Browsing.',
          categories: matches.map((match) => match.threatType ?? 'UNKNOWN'),
          latencyMs,
        };
      },
    };
  }

  private virusTotal(): Provider {
    return {
      id: 'virustotal',
      label: 'VirusTotal',
      isConfigured: () => Boolean(this.env.VIRUSTOTAL_API_KEY),
      lookup: async (url, hostname) => {
        const started = Date.now();
        const headers = { 'x-apikey': this.env.VIRUSTOTAL_API_KEY! };
        const timeout = this.env.THREAT_INTEL_TIMEOUT_MS || TIMEOUT_FALLBACK;
        const urlReport = await fetch(`https://www.virustotal.com/api/v3/urls/${base64Url(url)}`, {
          headers,
          signal: AbortSignal.timeout(timeout),
        });
        if (urlReport.status === 404) {
          return {
            provider: 'VirusTotal',
            status: 'unknown',
            malicious: false,
            suspicious: false,
            detail: 'VirusTotal has no report for this URL yet.',
            categories: [],
            latencyMs: Date.now() - started,
          };
        }
        if (!urlReport.ok) throw new Error(`VirusTotal HTTP ${urlReport.status}`);
        const body = (await safeJson(urlReport)) as {
          data?: { attributes?: { last_analysis_stats?: Record<string, number>; categories?: Record<string, string> } };
        } | null;
        const stats = body?.data?.attributes?.last_analysis_stats ?? {};
        const malicious = stats.malicious ?? 0;
        const suspicious = stats.suspicious ?? 0;
        const categories = Object.values(body?.data?.attributes?.categories ?? {}).slice(0, 5);

        let domainAgeDays: number | undefined;
        try {
          const domainReport = await fetch(`https://www.virustotal.com/api/v3/domains/${encodeURIComponent(hostname)}`, {
            headers,
            signal: AbortSignal.timeout(timeout),
          });
          if (domainReport.ok) {
            const domainBody = (await safeJson(domainReport)) as {
              data?: { attributes?: { creation_date?: number } };
            } | null;
            const created = domainBody?.data?.attributes?.creation_date;
            if (typeof created === 'number') {
              domainAgeDays = Math.max(0, Math.round((Date.now() - created * 1000) / 86_400_000));
            }
          }
        } catch {
          /* domain age is best-effort only */
        }

        return {
          provider: 'VirusTotal',
          status: malicious + suspicious > 0 ? 'hit' : 'clean',
          malicious: malicious > 0,
          suspicious: suspicious > 0,
          detail:
            malicious + suspicious > 0
              ? `VirusTotal reports ${malicious} malicious and ${suspicious} suspicious detections by security vendors.`
              : 'VirusTotal vendors report no detections for this URL so far.',
          categories,
          latencyMs: Date.now() - started,
          domainAgeDays,
        };
      },
    };
  }

  private urlhaus(): Provider {
    return {
      id: 'urlhaus',
      label: 'URLhaus (abuse.ch)',
      isConfigured: () => this.env.URLHAUS_ENABLED,
      lookup: async (url) => {
        const started = Date.now();
        const form = new URLSearchParams({ url });
        const response = await fetch('https://urlhaus-api.abuse.ch/v1/url/', {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(this.env.THREAT_INTEL_TIMEOUT_MS || TIMEOUT_FALLBACK),
        });
        if (!response.ok) throw new Error(`URLhaus HTTP ${response.status}`);
        const body = (await safeJson(response)) as {
          query_status?: string;
          threat?: string;
          tags?: string[];
          url_status?: string;
        } | null;
        const hit = body?.query_status === 'ok';
        return {
          provider: 'URLhaus',
          status: hit ? 'hit' : 'clean',
          malicious: hit,
          suspicious: hit,
          detail: hit
            ? `URLhaus lists this URL as ${body?.threat ?? 'malware distribution'} (${body?.url_status ?? 'unknown status'}).`
            : 'URLhaus has no entry for this URL.',
          categories: [body?.threat ?? 'malware', ...(body?.tags ?? []).slice(0, 3)].filter(Boolean),
          latencyMs: Date.now() - started,
        };
      },
    };
  }

  private phishTank(): Provider {
    return {
      id: 'phishtank',
      label: 'PhishTank',
      isConfigured: () => this.env.PHISHTANK_ENABLED && Boolean(this.env.PHISHTANK_API_KEY),
      lookup: async (url) => {
        const started = Date.now();
        const form = new URLSearchParams({ url, format: 'json', app_key: this.env.PHISHTANK_API_KEY! });
        const response = await fetch('https://checkurl.phishtank.com/checkurl/', {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(this.env.THREAT_INTEL_TIMEOUT_MS || TIMEOUT_FALLBACK),
        });
        if (!response.ok) throw new Error(`PhishTank HTTP ${response.status}`);
        const body = (await safeJson(response)) as {
          results?: { in_database?: boolean; verified?: boolean; valid?: boolean };
        } | null;
        const hit = Boolean(body?.results?.in_database && body?.results?.valid);
        return {
          provider: 'PhishTank',
          status: hit ? 'hit' : 'clean',
          malicious: hit,
          suspicious: hit,
          detail: hit
            ? `PhishTank lists this URL as a ${body?.results?.verified ? 'verified' : 'reported'} phishing page.`
            : 'PhishTank has no verified phishing record for this URL.',
          categories: hit ? ['phishing'] : [],
          latencyMs: Date.now() - started,
        };
      },
    };
  }

  /** Local registry: verified domains and corroborated community reports. */
  private localRegistry(): Provider {
    return {
      id: 'scamshield_registry',
      label: 'ScamShield registry',
      isConfigured: () => true,
      lookup: async (_url, hostname) => {
        const started = Date.now();
        const domain = hostname.replace(/^www\./, '');
        const record = await this.prisma.threatDomain.findFirst({
          where: { domain, active: true, verified: true },
          include: { sources: { include: { source: true } } },
        });
        if (!record) {
          return {
            provider: 'ScamShield registry',
            status: 'clean',
            malicious: false,
            suspicious: false,
            detail: 'No verified record in the ScamShield threat registry.',
            categories: [],
            latencyMs: Date.now() - started,
          };
        }
        return {
          provider: 'ScamShield registry',
          status: 'hit',
          malicious: true,
          suspicious: true,
          detail: `This domain is in the ScamShield verified threat registry as ${record.category} (${record.sources.length} source${record.sources.length === 1 ? '' : 's'}, last seen ${record.lastSeenAt.toISOString().slice(0, 10)}).`,
          categories: [record.category],
          latencyMs: Date.now() - started,
        };
      },
    };
  }

  /**
   * Deterministic fixtures for tests and local development. Never active in
   * production, even if the flag is set (loadEnv refuses that combination).
   */
  private devFixtures(): Provider {
    return {
      id: 'dev_fixtures',
      label: 'Development fixtures',
      isConfigured: () => this.env.THREAT_INTEL_DEV_FIXTURES && this.env.NODE_ENV !== 'production',
      lookup: async (_url, hostname) => {
        const started = Date.now();
        const fixtures: Record<string, { malicious: boolean; detail: string }> = {
          'phishing-test.scamshield.local': {
            malicious: true,
            detail: 'Development fixture: this domain is intentionally classified as a phishing test case.',
          },
          'malware-test.scamshield.local': {
            malicious: true,
            detail: 'Development fixture: this domain is intentionally classified as malware distribution.',
          },
          'safe-test.scamshield.local': {
            malicious: false,
            detail: 'Development fixture: this domain is intentionally clean.',
          },
        };
        const fixture = fixtures[hostname];
        if (!fixture) {
          return {
            provider: 'Development fixtures',
            status: 'unknown',
            malicious: false,
            suspicious: false,
            detail: 'No development fixture for this host.',
            categories: [],
            latencyMs: Date.now() - started,
          };
        }
        return {
          provider: 'Development fixtures',
          status: fixture.malicious ? 'hit' : 'clean',
          malicious: fixture.malicious,
          suspicious: fixture.malicious,
          detail: fixture.detail,
          categories: fixture.malicious ? ['phishing'] : [],
          latencyMs: Date.now() - started,
        };
      },
    };
  }

  available(): Provider[] {
    return this.providers.filter((provider) => provider.isConfigured());
  }

  disabled(): Provider[] {
    return this.providers.filter((provider) => !provider.isConfigured());
  }
}

@Injectable()
export class IntelService {
  private readonly logger = new Logger(IntelService.name);
  private readonly env = loadEnv();
  private readonly cache = new Map<string, { expiresAt: number; value: Awaited<ReturnType<IntelService['lookupUncached']>> }>();
  private readonly providers: ThreatIntelProviders;

  constructor(private readonly prisma: PrismaService) {
    this.providers = new ThreatIntelProviders(prisma);
  }

  get providerStatuses(): Array<{ id: string; label: string; configured: boolean }> {
    return this.providers.providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      configured: provider.isConfigured(),
    }));
  }

  async lookup(url: string, hostname: string, userId: string | null): Promise<{
    verdicts: ProviderVerdict[];
    providersUsed: string[];
    providersUnavailable: string[];
    domainAgeDays: number | null;
    registry: { riskLevel: RiskLevel; category: string; sources: string[]; verified: boolean } | null;
  }> {
    const key = `${hostname}|${url}`.slice(0, 2000);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const value = await this.lookupUncached(url, hostname, userId);
    if (this.cache.size > 500) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { expiresAt: Date.now() + 10 * 60 * 1000, value });
    return value;
  }

  private async lookupUncached(url: string, hostname: string, userId: string | null) {
    const configured = this.providers.available();
    const unavailable = this.providers.disabled().map((provider) => provider.label);
    const verdicts: ProviderVerdict[] = [];
    const used: string[] = [];

    const registryRecord = await this.prisma.threatDomain.findFirst({
      where: { domain: hostname.replace(/^www\./, ''), active: true },
      include: { sources: { include: { source: true } } },
    });

    const results = await Promise.all(
      configured.map(async (provider) => {
        const started = Date.now();
        try {
          const verdict = await provider.lookup(url, hostname);
          used.push(provider.label);
          await this.recordUsage(userId, provider.id, Date.now() - started, true);
          return verdict;
        } catch (error) {
          await this.recordUsage(userId, provider.id, Date.now() - started, false, error);
          this.logger.warn(`${provider.label} lookup failed: ${error instanceof Error ? error.message : 'unknown'}`);
          unavailable.push(provider.label);
          return null;
        }
      }),
    );
    for (const verdict of results) {
      if (verdict) verdicts.push(verdict);
    }

    const domainAgeDays =
      verdicts.map((verdict) => verdict.domainAgeDays).find((age): age is number => typeof age === 'number') ?? null;

    return {
      verdicts,
      providersUsed: used,
      providersUnavailable: Array.from(new Set(unavailable)),
      domainAgeDays,
      registry: registryRecord
        ? {
            riskLevel: registryRecord.riskLevel,
            category: registryRecord.category,
            sources: registryRecord.sources.map((entry) => entry.source.name),
            verified: registryRecord.verified,
          }
        : null,
    };
  }

  private async recordUsage(
    userId: string | null,
    provider: string,
    latencyMs: number,
    success: boolean,
    error?: unknown,
  ): Promise<void> {
    try {
      await this.prisma.apiUsage.create({
        data: {
          userId,
          provider,
          statusCode: success ? 200 : 502,
          latencyMs,
          success,
          errorCode: success ? null : error instanceof Error ? error.message.slice(0, 200) : 'unknown',
        },
      });
    } catch (recordError) {
      this.logger.debug(`Could not record provider usage: ${recordError instanceof Error ? recordError.message : 'unknown'}`);
    }
  }

  async health(): Promise<Array<{ name: string; configured: boolean; status: 'healthy' | 'disabled'; message: string }>> {
    const statuses = this.providers.providers.map((provider) => {
      const configured = provider.isConfigured();
      return {
        name: provider.label,
        configured,
        status: configured ? ('healthy' as const) : ('disabled' as const),
        message: configured ? 'Configured' : 'No credentials/flag configured; skipped and reported as unavailable',
      };
    });
    return statuses;
  }

  isProductionSafe(): boolean {
    return !(this.env.NODE_ENV === 'production' && this.env.THREAT_INTEL_DEV_FIXTURES);
  }
}
