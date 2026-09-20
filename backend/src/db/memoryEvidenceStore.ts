import type { DecisionRecord, EvidenceBundle, PolicyRecord } from '../records/schemas.ts';
import type { EvidenceStore } from '../verification/service.ts';
import type { Run } from '../api/cases.ts';

export class InMemoryEvidenceStore implements EvidenceStore {
  private readonly caseNumbers = new Map<string, number>();
  async getCaseNumber(id: string) { return this.caseNumbers.get(id) ?? null; }
  private readonly runs = new Map<string, Run>();
  async listBundles() { return structuredClone([...this.bundles.values()]); }
  async saveRun(run: Run) { this.runs.set(run.id, structuredClone(run)); }
  async getRun(id: string) { return structuredClone(this.runs.get(id) ?? null); }
  private readonly policies = new Map<string, PolicyRecord>();
  private readonly bundles = new Map<string, EvidenceBundle>();
  private readonly decisions = new Map<string, DecisionRecord>();

  constructor(policies: PolicyRecord[] = []) {
    for (const policy of policies) this.policies.set(policy.policy_id, policy);
  }

  async getPolicy(policyId: string): Promise<PolicyRecord | null> {
    return this.policies.get(policyId) ?? null;
  }

  async getBundle(requestId: string): Promise<EvidenceBundle | null> {
    return this.bundles.get(requestId) ?? null;
  }

  async saveBundle(bundle: EvidenceBundle): Promise<void> {
    if (!this.caseNumbers.has(bundle.request.request_id)) this.caseNumbers.set(bundle.request.request_id, this.caseNumbers.size + 1);
    this.bundles.set(bundle.request.request_id, bundle);
  }

  async saveDecision(decision: DecisionRecord): Promise<void> {
    this.decisions.set(decision.request_id, decision);
  }

  async deleteInstitutionDecision(requestId: string): Promise<void> {
    this.decisions.delete(requestId);
  }
}
