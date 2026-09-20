import type { PrivateKeyAccount } from 'viem/accounts';
import { hashRecord, signRecord, verifyRecordSignature } from '../crypto/records.ts';
import { DecisionSchema, type DecisionRecord, type PolicyRecord, type RequestRecord, type VerificationReceipt } from '../records/schemas.ts';

import { testOutcome } from './testOutcome.ts';

export type KeyRegistry = Record<string, `0x${string}`>;

export async function decideRequest(
  account: PrivateKeyAccount,
  request: RequestRecord,
  policy: PolicyRecord,
  receipt: VerificationReceipt | null,
  registry: KeyRegistry,
  options: { riskReject?: boolean; rejectionTest?: boolean } = {},
): Promise<DecisionRecord> {
  const policyHash = hashRecord(policy, 'enterprise_signature');
  if (request.policy_id !== policy.policy_id || request.policy_hash !== policyHash || request.asset !== policy.asset ||
      Date.parse(request.created_at) < Date.parse(policy.valid_from)) {
    throw new Error('POLICY_MISMATCH');
  }
  if (!registry[policy.enterprise_key_id] ||
      !await verifyRecordSignature(policy, 'enterprise_signature', registry[policy.enterprise_key_id])) {
    throw new Error('INVALID_ENTERPRISE_SIGNATURE');
  }
  if (!registry[request.agent_key_id] ||
      !await verifyRecordSignature(request, 'agent_signature', registry[request.agent_key_id])) {
    throw new Error('INVALID_AGENT_SIGNATURE');
  }
  const requestHash = hashRecord(request, 'agent_signature');
  if (!receipt || receipt.request_id !== request.request_id || receipt.request_hash !== requestHash ||
      receipt.policy_hash !== policyHash || !registry[receipt.verification_key_id] ||
      !await verifyRecordSignature(receipt, 'verification_signature', registry[receipt.verification_key_id])) {
    throw new Error('UNVERIFIED_REQUEST');
  }
  const exceeded = BigInt(request.amount_base_units) > BigInt(policy.max_amount_base_units);
  const outcome = options.rejectionTest
    ? testOutcome(request.amount_base_units, policy.max_amount_base_units)
    : { decision: options.riskReject || exceeded ? 'REJECT' : 'APPROVE', reason_code: exceeded ? 'LIMIT_EXCEEDED' : options.riskReject ? 'KYT_RISK' : 'WITHIN_LIMIT' };
  return DecisionSchema.parse(await signRecord({
    schema_version: 1,
    request_id: request.request_id,
    request_hash: requestHash,
    policy_id: policy.policy_id,
    policy_hash: policyHash,
    ...outcome,
    institution_key_id: 'institution-key-1',
  }, 'institution_signature', account));
}
