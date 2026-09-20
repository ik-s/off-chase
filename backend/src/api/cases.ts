import { randomUUID } from 'node:crypto';
import type { PrivateKeyAccount } from 'viem/accounts';
import { createRequest } from '../agent/mockAgent.ts';
import type { DecisionRecord, EvidenceBundle, PolicyRecord, RequestRecord } from '../records/schemas.ts';
import type { EvidenceStore, GatewayService } from '../verification/service.ts';
import type { AnchorReader, VerificationReport } from '../verification/verifier.ts';

export type Scenario = 'normal' | 'tampered' | 'unknown' | 'missing';
export interface Run {
  id: string; requestId: string; scenario: Scenario; status: 'running' | 'complete' | 'failed';
  events: Array<{ stage: string; at: string }>;
  error?: string;
  testAmountBaseUnits?: string;
  signedRequest?: RequestRecord;
  receivedDecision?: DecisionRecord;
  submittedBundle?: EvidenceBundle;
}
export interface CaseStore extends EvidenceStore {
  getCaseNumber(id: string): Promise<number | null>;
  listBundles(): Promise<EvidenceBundle[]>;
  saveRun(run: Run): Promise<void>;
  getRun(id: string): Promise<Run | null>;
}
export interface RunControl {
  acquire(id: string): Promise<void>;
  release(id: string): Promise<void>;
  isActive(id: string): Promise<boolean>;
}
export interface CaseExecution {
  control?: RunControl;
  waitUntil?: (task: Promise<void>) => void;
}
export const scenarioLabels: Record<Scenario, string> = { normal: '한도 초과 거절', tampered: '정책 기록 변조', unknown: '알 수 없는 거절', missing: '응답 누락' };
export function caseLabel(bundle: EvidenceBundle, run: Run | null) {
  if (run?.scenario === 'tampered') return scenarioLabels.tampered;
  if (run && !run.testAmountBaseUnits) return scenarioLabels[run.scenario];
  const reason = bundle.decision?.reason_code;
  return reason === 'LIMIT_EXCEEDED' ? '한도 초과 거절' : reason === 'KYT_RISK' ? '알 수 없는 거절' : reason === 'WITHIN_LIMIT' ? '한도 이내 승인' : '응답 대기';
}
export function submittedEvidence(bundle: EvidenceBundle, run: Run | null): EvidenceBundle {
  return structuredClone(run?.submittedBundle ?? bundle);
}

export class CaseService {
  private active = new Set<string>();
  private store: CaseStore;
  private gateway: GatewayService;
  private chain: AnchorReader;
  private verify: (input: unknown) => Promise<VerificationReport>;
  private agent: PrivateKeyAccount;
  private policy: PolicyRecord;
  private recipient: `0x${string}`;
  private execution: CaseExecution;
  constructor(store: CaseStore, gateway: GatewayService, chain: AnchorReader,
    verify: (input: unknown) => Promise<VerificationReport>, agent: PrivateKeyAccount,
    policy: PolicyRecord, recipient: `0x${string}`, execution: CaseExecution = {}) {
    this.store = store; this.gateway = gateway; this.chain = chain; this.verify = verify;
    this.agent = agent; this.policy = policy; this.recipient = recipient;
    this.execution = execution;
  }

  async getRun(id: string) {
    const run = await this.store.getRun(id);
    if (run?.status === 'running' && !this.active.has(id) && !(await this.execution.control?.isActive(id))) {
      return { ...run, status: 'failed' as const, error: 'RUN_INTERRUPTED_CHECK_EVIDENCE' };
    }
    return run ? { ...run, decision: run.receivedDecision?.decision, reasonCode: run.receivedDecision?.reason_code } : null;
  }

  async start(scenario: Scenario, testAmountBaseUnits?: string): Promise<Run> {
    if (testAmountBaseUnits !== undefined && !/^[1-9][0-9]{0,29}$/.test(testAmountBaseUnits)) throw new Error('INVALID_TEST_AMOUNT');
    if (scenario === 'tampered' && testAmountBaseUnits !== undefined && BigInt(testAmountBaseUnits) >= BigInt(this.policy.max_amount_base_units)) throw new Error('POLICY_TAMPER_REQUIRES_BELOW_LIMIT_REQUEST');
    // One writer at a time avoids competing wallet nonces and preserves the deadline budget.
    if (this.active.size) throw new Error('DEMO_RUN_IN_PROGRESS');
    const id = `REQ-${randomUUID()}`;
    this.active.add(id);
    const run: Run = { id, requestId: id, scenario, status: 'running', events: [], ...(testAmountBaseUnits !== undefined ? { testAmountBaseUnits } : {}) };
    try {
      await this.execution.control?.acquire(id);
      await this.store.saveRun(run);
    }
    catch (error) { this.active.delete(id); throw error; }
    const task = this.execute(run);
    this.execution.waitUntil?.(task);
    return structuredClone(run);
  }

  private async execute(run: Run) {
    const progress = async (stage: string) => {
      run.events.push({ stage, at: new Date().toISOString() });
      await this.store.saveRun(run);
    };
    try {
      const request = await createRequest(this.agent, this.policy, {
        requestId: run.requestId, createdAt: new Date().toISOString(),
        amountBaseUnits: run.testAmountBaseUnits ?? (run.scenario === 'normal' ? '4500000000' : '3500000000'), recipient: this.recipient,
      });
      run.signedRequest = request;
      await progress('agent_signed');
      const bundle = await this.gateway.submitRequest(request, {
        rejectionTest: run.testAmountBaseUnits !== undefined,
        omitDecision: run.scenario === 'missing', riskReject: run.scenario === 'unknown', progress,
        captureDecision: async decision => { run.receivedDecision = decision; await this.store.saveRun(run); },
      });
      if (run.scenario === 'tampered') {
        run.submittedBundle = structuredClone(bundle);
        run.submittedBundle.policy.max_amount_base_units = run.testAmountBaseUnits !== undefined ? '5000000000' : '3000000000';
        await progress('policy_copy_altered');
      }
      run.status = 'complete';
      await this.store.saveRun(run);
    } catch (error) {
      run.status = 'failed';
      run.error = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'RUN_FAILED_CHECK_SERVER';
      // Avoid leaking provider URLs or credentials in browser errors.
      try { await this.store.saveRun(run); } catch { /* getRun reports interrupted; chain evidence remains recoverable. */ }
    } finally {
      this.active.delete(run.id);
      // A failed/terminated execution retains its lock until an operator checks
      // pending chain transactions. Never expire a writer lock automatically.
      if (run.status === 'complete') {
        try { await this.execution.control?.release(run.id); } catch { /* fail closed */ }
      }
    }
  }

  private async displayId(id: string) {
    const number = await this.store.getCaseNumber(id);
    if (number === null) throw new Error('CASE_NUMBER_MISSING');
    return `REQ-${String(number).padStart(3, '0')}`;
  }

  async detail(id: string) {
    const original = await this.store.getBundle(id);
    if (!original) return null;
    const run = await this.getRun(id);
    const bundle = submittedEvidence(original, run);
    const [report, anchor, chainTime] = await Promise.all([this.verify(bundle), this.chain.readRecord(id), this.chain.chainTime()]);
    return {
      displayId: await this.displayId(id), bundle, report, label: caseLabel(bundle, run),
      institutionRecordPresent: !!original.decision, chainTime, run,
      requestAnchor: { hash: anchor.requestHash ?? '', policyHash: anchor.policyHash ?? '', timestamp: anchor.requestAnchoredAt, block: bundle.verification_receipt.request_anchor_block },
      decisionAnchor: anchor.decisionHash && anchor.decisionAnchoredAt !== null ? { hash: anchor.decisionHash, timestamp: anchor.decisionAnchoredAt, block: null } : null,
      ...(run?.scenario === 'tampered' && run.status === 'complete' ? { change: { before: '정책 한도 4,000 USDC', after: `제시된 정책 한도 ${run.testAmountBaseUnits !== undefined ? '5,000' : '3,000'} USDC` }, originalBundle: original } : {}),
    };
  }

  async list() {
    const bundles = await this.store.listBundles();
    const items = [];
    for (const bundle of bundles.sort((a, b) => b.request.created_at.localeCompare(a.request.created_at))) {
      if (bundle.decision?.decision !== 'REJECT') continue;
      const run = await this.getRun(bundle.request.request_id);
      const report = await this.verify(submittedEvidence(bundle, run));
      items.push({ id: bundle.request.request_id, displayId: await this.displayId(bundle.request.request_id), amountBaseUnits: bundle.request.amount_base_units,
        decision: bundle.decision.decision, status: report.status, label: caseLabel(bundle, run) });
    }
    return items;
  }
}
