import type { EvidenceBundle } from './records.ts';

export const statuses = ['VERIFIED', 'PROCESSING', 'MISSING', 'TAMPERED', 'INVALID'] as const;
export type VerificationStatus = typeof statuses[number];
export type CaseFilter = 'ALL' | VerificationStatus;
export type EvidenceSelection = 'policy' | 'request' | 'verification_receipt' | 'decision' | 'anchors';
export type DemoScenario = 'normal' | 'tampered' | 'missing' | 'deleted';
export type LoadState = 'loading' | 'ready' | 'error';
export interface VerificationCheckViewModel {
  id: string;
  label: string;
  state: 'passed' | 'failed' | 'not-run' | 'not-applicable';
  detail: string;
  records: EvidenceSelection[];
  error?: string;
}
export interface VerificationReportViewModel {
  status: VerificationStatus;
  errors: string[];
  checks: VerificationCheckViewModel[];
}
export interface CaseSummaryViewModel {
  id: string;
  amount: string;
  decision: 'REJECT' | 'APPROVE' | null;
  status: VerificationStatus;
  label: string;
}
export interface CaseDetail {
  bundle: EvidenceBundle;
  report: VerificationReportViewModel;
  label: string;
  institutionRecordPresent: boolean;
  chainTime: number;
  requestAnchor: { hash: string; policyHash: string; timestamp: number; block: number };
  decisionAnchor: { hash: string; timestamp: number; block: number } | null;
  change?: { before: string; after: string };
}
export type VerificationOutcome =
  | { kind: 'report'; report: VerificationReportViewModel }
  | { kind: 'unsupported'; message: string };

/** Frontend port, not an HTTP contract. No transport details in components. */
export interface EvidenceRepository {
  readonly mode: 'mock' | 'api';
  listCases(): Promise<CaseSummaryViewModel[]>;
  getCase(requestId: string): Promise<CaseDetail>;
  downloadEvidence(requestId: string): Promise<{ filename: string; content: string }>;
  verifyEvidence(bundle: unknown): Promise<VerificationOutcome>;
  runDemo(scenario: DemoScenario): Promise<string>;
}
