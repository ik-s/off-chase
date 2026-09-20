import type { DecisionRecord, PolicyRecord, RequestRecord } from '../records/schemas.ts';

/** KYT records attest the institution's response, not the truth of its risk assessment. */
export function matchesDecisionPolicy(request: RequestRecord, policy: PolicyRecord, decision: DecisionRecord): boolean {
  if (decision.decision === 'REJECT' && decision.reason_code === 'KYT_RISK') return true;
  const exceeded = BigInt(request.amount_base_units) > BigInt(policy.max_amount_base_units);
  return decision.decision === (exceeded ? 'REJECT' : 'APPROVE') &&
    decision.reason_code === (exceeded ? 'LIMIT_EXCEEDED' : 'WITHIN_LIMIT');
}
