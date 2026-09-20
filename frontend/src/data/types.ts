import type { EvidenceBundle } from './records.ts';

export const statuses = ['VERIFIED', 'PROCESSING', 'MISSING', 'TAMPERED', 'INVALID'] as const;
export type VerificationStatus = typeof statuses[number];
export type CaseFilter = 'ALL' | VerificationStatus;
export type EvidenceSelection = 'policy' | 'request' | 'verification_receipt' | 'decision' | 'anchors';
export type DemoScenario = 'normal' | 'tampered' | 'missing' | 'unknown';
export interface DemoRun { decision?: 'APPROVE' | 'REJECT'; reasonCode?: string; id: string; requestId: string; scenario: DemoScenario; status: 'running' | 'complete' | 'failed'; events: Array<{ stage: string; at: string }>; error?: string }
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
  displayId?: string;
  id: string;
  amount: string;
  decision: 'REJECT' | 'APPROVE' | null;
  status: VerificationStatus;
  label: string;
}
export interface CaseDetail {
  displayId?: string;
  run?: DemoRun | null;
  originalBundle?: EvidenceBundle;
  bundle: EvidenceBundle;
  report: VerificationReportViewModel;
  label: string;
  institutionRecordPresent: boolean;
  chainTime: number;
  requestAnchor: { hash: string; policyHash: string; timestamp: number; block: number };
  decisionAnchor: { hash: string; timestamp: number; block: number | null } | null;
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
  submitTestRequest?(amountBaseUnits: string, onProgress?: (run: DemoRun) => void, signal?: AbortSignal, policyTamper?: boolean): Promise<string>;
  runDemo(scenario: DemoScenario, onProgress?: (run: DemoRun) => void, signal?: AbortSignal): Promise<string>;
}
