import { Injectable, Logger } from '@nestjs/common';
import type { ScamCategory } from '@scamshield/shared-types';
import { CATEGORY_LABELS } from '@scamshield/shared-types';
import { ApiException } from '../common/http/api-exception';
import { analyzeUrlStructure } from './detectors/url-rules';
import { inspectTls, safeFetch, type TlsInfo } from './detectors/ssrf';
import { extractEntities, hostOf } from './detectors/extract';
import { registrableDomain } from './detectors/brands';
import type { CategoryVotes, DetectorOutput, RawFinding } from './detectors/types';
import { IntelService, type ProviderVerdict } from './intel/intel.service';

const PROVIDER_WEIGHTS: Record<string, number> = {
  'ScamShield registry': 58,
  'Google Safe Browsing': 56,
  URLhaus: 52,
  PhishTank: 50,
  VirusTotal: 45,
  'Development fixtures': 50,
};

export interface UrlAnalysisOptions {
  deep: boolean;
  userId: string | null;
  scanType?: 'url' | 'screenshot' | 'qr';
}

@Injectable()
export class UrlAnalyzerService {
  private readonly logger = new Logger(UrlAnalyzerService.name);

  constructor(private readonly intel: IntelService) {}

  async analyze(rawUrl: string, options: UrlAnalysisOptions): Promise<DetectorOutput> {
    const structure = analyzeUrlStructure(rawUrl);
    const findings: RawFinding[] = [...structure.findings];
    const categoryVotes: CategoryVotes = { ...structure.categoryVotes };
    const providersUsed = new Set<string>();
    const providersUnavailable = new Set<string>();
    const limitations = new Set<string>(structure.limitations);
    let signalsEvaluated = structure.signalsEvaluated;

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

    // Reputation providers run even when the URL is structurally blocked (cheap,
    // and a known-bad IP literal still deserves an attribution).
    let intel: Awaited<ReturnType<IntelService['lookup']>> | null = null;
    try {
      intel = await this.intel.lookup(structure.href, structure.host, options.userId);
      signalsEvaluated += Math.max(1, intel.providersUsed.length);
      intel.providersUsed.forEach((provider) => providersUsed.add(provider));
      intel.providersUnavailable.forEach((provider) => providersUnavailable.add(provider));

      for (const verdict of intel.verdicts) {
        if (verdict.malicious) {
          add({
            key: `intel_${verdict.provider.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
            title: `Known threat: ${verdict.provider}`,
            severity: 'critical',
            weight: PROVIDER_WEIGHTS[verdict.provider] ?? 45,
            evidence: verdict.detail,
            recommendedAction: 'Do not open this link or enter any information. Block the sender and report the link.',
            source:
              verdict.provider === 'ScamShield registry'
                ? 'community_reports'
                : verdict.provider === 'Google Safe Browsing'
                  ? 'google_safe_browsing'
                  : verdict.provider === 'VirusTotal'
                    ? 'virustotal'
                    : verdict.provider === 'URLhaus'
                      ? 'urlhaus'
                      : 'phishtank',
            method: 'threat_intel',
            category: 'phishing',
          });
        }
      }

      if (intel.registry && !intel.registry.verified) {
        add({
          key: 'community_reports_unverified',
          title: 'Community reports exist for this domain',
          severity: 'low',
          weight: 12,
          evidence: `Users have submitted ${CATEGORY_LABELS[(intel.registry.category as ScamCategory) ?? 'unknown'] ?? 'scam'} reports for this domain. Reports are unverified and are not treated as proof of fraud.`,
          recommendedAction: 'Be extra careful, and verify the organisation independently.',
          source: 'community_reports',
          method: 'threat_intel',
        });
      }

      if (intel.domainAgeDays !== null) {
        signalsEvaluated += 1;
        if (intel.domainAgeDays < 30) {
          add({
            key: 'newly_registered_domain',
            title: 'Domain registered very recently',
            severity: 'high',
            weight: 28,
            evidence: `Threat intelligence reports this domain was registered ${intel.domainAgeDays} day${intel.domainAgeDays === 1 ? '' : 's'} ago. Most impersonation sites are days old.`,
            recommendedAction: 'Do not trust a brand-new domain with payments or credentials.',
            category: 'phishing',
          });
        } else if (intel.domainAgeDays < 90) {
          add({
            key: 'recently_registered_domain',
            title: 'Recently registered domain',
            severity: 'medium',
            weight: 15,
            evidence: `The domain is about ${intel.domainAgeDays} days old according to threat intelligence.`,
            recommendedAction: 'Verify the organisation before using the site.',
            category: 'phishing',
          });
        }
      } else {
        limitations.add('Domain registration age could not be established from available sources.');
      }
    } catch (error) {
      this.logger.warn(`Threat intelligence lookup failed: ${error instanceof Error ? error.message : 'unknown'}`);
      providersUnavailable.add('Threat intelligence');
      limitations.add('Threat-intelligence providers were unreachable, so only structural signals were evaluated.');
    }

    let tls: TlsInfo | null = null;
    const finalDestination = structure.href;

    if (options.deep && !structure.blockNetwork) {
      try {
        const response = await safeFetch(structure.href, { timeoutMs: 12_000 });
        signalsEvaluated += 4;
        const finalHost = hostOf(response.finalUrl) ?? structure.host;
        const finalDomain = registrableDomain(finalHost);

        if (response.redirectChain.length > 0) {
          categoryVotes.phishing = (categoryVotes.phishing ?? 0) + 10;
          const crossDomain = finalDomain !== structure.registrable;
          add({
            key: 'redirect_chain',
            title: 'Link redirects before arriving',
            severity: crossDomain ? 'medium' : 'low',
            weight: crossDomain ? 22 : 12,
            evidence:
              response.redirectChain.length > 1
                ? `The link went through ${response.redirectChain.length} redirects and finishes at ${finalDomain}. Redirects are used to hide the real destination.`
                : `The link redirects to ${finalDomain}${crossDomain ? ', a different domain from the one you submitted' : ''}.`,
            recommendedAction: 'Prefer the organisation’s official domain instead of following redirects.',
          });
        }

        if (response.status >= 400) {
          limitations.add(
            `The destination returned HTTP ${response.status}. It may be offline, blocked, or hiding content from automated checks.`,
          );
        }

        if (response.bodyTruncated) {
          limitations.add('Only the first 1 MB of the page was analysed.');
        }

        type CategoryVotesShape = CategoryVotes;
        const body = response.body.slice(0, 400_000);
        const bodyFindings = this.analysePageContent(body, finalDomain, categoryVotes);
        signalsEvaluated += 5;
        bodyFindings.forEach((finding) => add(finding));

        if (body.trim().length === 0) {
          limitations.add('The page returned no readable text (it may render client-side); JavaScript was not executed.');
        }

        if (response.headers['strict-transport-security'] === undefined && structure.href.startsWith('https://')) {
          limitations.add('The site does not send a Strict-Transport-Security header.');
        }

        // TLS inspection is independent of page content.
        if (structure.href.startsWith('https://')) {
          tls = await inspectTls(finalHost);
          signalsEvaluated += 1;
          if (tls.reachable && tls.selfSigned) {
            add({
              key: 'self_signed_certificate',
              title: 'Self-signed TLS certificate',
              severity: 'high',
              weight: 34,
              evidence: 'The site presents a self-signed certificate instead of one from a trusted certificate authority.',
              recommendedAction: 'Do not enter any information on a site with an invalid certificate.',
              category: 'phishing',
            });
          }
          if (tls.reachable && tls.hostnameMismatch) {
            add({
              key: 'certificate_name_mismatch',
              title: 'Certificate does not match the domain',
              severity: 'critical',
              weight: 42,
              evidence: `The TLS certificate does not match ${finalHost} (${tls.error ?? 'name mismatch'}). This is typical of impersonation infrastructure.`,
              recommendedAction: 'Leave the site immediately and do not enter credentials.',
              category: 'phishing',
            });
          }
          if (tls.reachable && tls.expired) {
            add({
              key: 'expired_certificate',
              title: 'Expired TLS certificate',
              severity: 'medium',
              weight: 20,
              evidence: 'The TLS certificate has expired; browsers will show a warning.',
              recommendedAction: 'Do not proceed past a certificate warning.',
              category: 'phishing',
            });
          }
          if (tls.reachable && !tls.valid && !tls.expired && !tls.hostnameMismatch && !tls.selfSigned) {
            limitations.add(`TLS certificate validation reported: ${tls.error ?? 'unknown issue'}.`);
          }
        }
      } catch (error) {
        const message = error instanceof ApiException ? error.message : 'The destination could not be inspected.';
        limitations.add(message);
        this.logger.log(`URL fetch skipped/failed for ${structure.host}: ${message}`);

        if (structure.href.startsWith('https://')) {
          tls = await inspectTls(structure.host).catch(() => null);
          if (tls?.reachable && tls.selfSigned) {
            add({
              key: 'self_signed_certificate',
              title: 'Self-signed TLS certificate',
              severity: 'high',
              weight: 34,
              evidence: 'The site presents a self-signed certificate instead of one from a trusted certificate authority.',
              recommendedAction: 'Do not enter any information on a site with an invalid certificate.',
              category: 'phishing',
            });
          }
        }
      }
    } else if (!options.deep) {
      limitations.add(
        'Links were checked for structural and reputation indicators only. The destination page was not fetched.',
      );
    }

    if (structure.blockNetwork) {
      limitations.add(`The destination was not contacted for safety reasons (${structure.blockReason ?? 'unsafe target'}).`);
    }

    limitations.add('No scanner can prove a website is safe; a clean result only means no known indicators were found.');

    return {
      findings,
      extracted: {
        ...extractEntities(structure.href),
        domains: Array.from(new Set([structure.registrable, ...(intel?.registry ? [] : [])].filter(Boolean))),
      },
      categoryVotes,
      signalsEvaluated,
      providersUsed: [...providersUsed],
      providersUnavailable: [...providersUnavailable],
      limitations: [...limitations],
      context: {
        finalUrl: finalDestination,
        redirectCount: 0,
        tls: tls
          ? {
              valid: tls.valid,
              issuer: tls.issuer,
              expiresInDays: tls.expiresInDays,
              selfSigned: tls.selfSigned,
            }
          : null,
        registry: intel?.registry ?? null,
      },
    };
  }

  /** Content checks that never execute page code. */
  private analysePageContent(
    html: string,
    host: string,
    categoryVotes: CategoryVotes,
  ): Array<Omit<RawFinding, 'source' | 'method' | 'observedAt'> & { method?: RawFinding['method']; source?: RawFinding['source'] }> {
    const findings: Array<Omit<RawFinding, 'source' | 'method' | 'observedAt'> & { method?: RawFinding['method']; source?: RawFinding['source'] }> = [];
    const lower = html.toLowerCase();
    if (lower.length === 0) return findings;

    const passwordInputs = (lower.match(/<input[^>]{0,400}type\s*=\s*["']?password/g) ?? []).length;
    if (passwordInputs > 0) {
      const brandLeak = /(sbi|hdfc|icici|axis|kotak|paytm|phonepe|netflix|amazon)/i.test(html.slice(0, 100_000));
      findings.push({
        key: 'password_form',
        title: 'Page asks for a password',
        severity: brandLeak ? 'critical' : 'high',
        weight: brandLeak ? 44 : 32,
        evidence: `The page contains ${passwordInputs} password field${passwordInputs === 1 ? '' : 's'}${brandLeak ? ' and references a well-known brand' : ''}, on a domain that is not that brand’s official domain.`,
        recommendedAction: 'Only sign in through the organisation’s official app or website, never via a link.',
        category: 'phishing',
      });
      categoryVotes.phishing = (categoryVotes.phishing ?? 0) + 20;
    }

    if (/<form[^>]{0,500}action\s*=\s*["']https?:\/\/([^"'/]+)/i.test(html)) {
      const actionMatch = html.match(/<form[^>]{0,500}action\s*=\s*["']https?:\/\/([^"'/]+)/i);
      const actionHost = actionMatch?.[1]?.toLowerCase() ?? '';
      if (actionHost && registrableDomain(actionHost) !== registrableDomain(host)) {
        findings.push({
          key: 'external_form_submission',
          title: 'Form sends data to another domain',
          severity: 'critical',
          weight: 40,
          evidence: `A form on this page submits to ${actionHost}, a different domain from the page itself — a classic credential-harvesting pattern.`,
          recommendedAction: 'Do not submit anything on this page.',
          category: 'phishing',
        });
      }
    }

    const dangerousHref = html.match(/href\s*=\s*["'][^"']{0,300}\.(apk|exe|scr|msi|bat|jar|zip)(?:[?#][^"']*)?["']/i);
    if (dangerousHref) {
      findings.push({
        key: 'page_offers_executable',
        title: 'Page offers an installable download',
        severity: 'critical',
        weight: 46,
        evidence: `The page links directly to a .${dangerousHref[1]} file. Installing files from unknown sites is a common malware infection path.`,
        recommendedAction: 'Do not download or install files from this page.',
        category: 'phishing',
      });
    }

    if (/<meta[^>]{0,300}http-equiv\s*=\s*["']?refresh[^>]{0,300}url=/i.test(html)) {
      findings.push({
        key: 'meta_refresh_redirect',
        title: 'Page immediately redirects',
        severity: 'medium',
        weight: 18,
        evidence: 'The page uses an automatic meta-refresh redirect, often used to bounce visitors to a hostile destination.',
        recommendedAction: 'Close the page and use the official site.',
        category: 'phishing',
      });
    }

    if (/(atob\s*\(|eval\s*\(|fromcharcode\s*\(|unescape\s*\()/i.test(html)) {
      findings.push({
        key: 'obfuscated_script',
        title: 'Obfuscated script on the page',
        severity: 'medium',
        weight: 22,
        evidence: 'The page contains obfuscated JavaScript (eval/atob/fromCharCode), frequently used to hide malicious behaviour from scanners.',
        recommendedAction: 'Do not interact with the page. Report the link.',
        category: 'phishing',
      });
    }

    return findings;
  }
}
