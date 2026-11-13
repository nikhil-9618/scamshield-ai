import type {
  Channel,
  DetectionMethod,
  EvidenceSource,
  ExtractedEntities,
  FindingSeverity,
  ModelConfidence,
  ScamCategory,
  ScanAnalysis,
  ScanType,
} from '@scamshield/shared-types';

/** A finding produced by a detector before scoring and persistence. */
export interface RawFinding {
  key: string;
  title: string;
  severity: FindingSeverity;
  evidence: string;
  method: DetectionMethod;
  source: EvidenceSource;
  recommendedAction: string;
  /** Base points before the scorer applies diminishing returns. */
  weight: number;
  category?: ScamCategory;
  observedAt?: string;
}

export interface CategoryVotes {
  [category: string]: number;
}

export interface DetectorOutput {
  findings: RawFinding[];
  extracted: ExtractedEntities;
  categoryVotes: CategoryVotes;
  signalsEvaluated: number;
  providersUsed: string[];
  providersUnavailable: string[];
  limitations: string[];
  modelConfidence?: ModelConfidence | null;
  nlpModel?: string | null;
  context?: Record<string, unknown>;
}

export interface ScanInput {
  scanId: string;
  type: ScanType;
  content: string | null;
  decodedValue: string | null;
  channel: Channel | null;
  userId: string | null;
}

export const emptyEntities = (): ExtractedEntities => ({
  urls: [],
  domains: [],
  phoneNumbers: [],
  emailAddresses: [],
  upiIds: [],
});

export const emptyOutput = (limitations: string[] = []): DetectorOutput => ({
  findings: [],
  extracted: emptyEntities(),
  categoryVotes: {},
  signalsEvaluated: 0,
  providersUsed: [],
  providersUnavailable: [],
  limitations,
});

export interface BuildAnalysisInput {
  findings: RawFinding[];
  extracted: ExtractedEntities;
  categoryVotes: CategoryVotes;
  signalsEvaluated: number;
  providersUsed: string[];
  providersUnavailable: string[];
  limitations: string[];
  fallbackCategory?: ScamCategory;
  modelConfidence?: ModelConfidence | null;
  nlpModel?: string | null;
  aiExplanation?: boolean;
}

export type AnalysisResult = ScanAnalysis;
