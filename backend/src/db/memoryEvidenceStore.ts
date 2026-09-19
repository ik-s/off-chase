import type { DecisionRecord, EvidenceBundle, PolicyRecord } from '../records/schemas.ts';
import type { EvidenceStore } from '../verification/service.ts';

export class InMemoryEvidenceStore implements EvidenceStore {
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
    this.bundles.set(bundle.request.request_id, bundle);
  }

  async saveDecision(decision: DecisionRecord): Promise<void> {
    this.decisions.set(decision.request_id, decision);
  }

  async deleteInstitutionDecision(requestId: string): Promise<void> {
    this.decisions.delete(requestId);
  }
}
