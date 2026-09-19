import type { Address, Hex } from 'viem';
import { hashRecord, verifyRecordSignature } from '../crypto/records.ts';
import type { AnchorRecord } from '../blockchain/anchorClient.ts';
import { EvidenceBundleSchema, type EvidenceBundle } from '../records/schemas.ts';
import type { KeyRegistry } from '../institution/mockWallet.ts';

export type VerificationStatus = 'VERIFIED' | 'TAMPERED' | 'MISSING' | 'PROCESSING' | 'INVALID';
export interface VerificationReport {
  status: VerificationStatus;
  errors: string[];
}

export interface AnchorReader {
  readonly address: Address;
  readonly chainId: number;
  readRecord(requestId: string): Promise<AnchorRecord>;
  chainTime(): Promise<number>;
  verifyRequestTx(input: {
    requestId: string; requestHash: Hex; policyHash: Hex; tx: Hex;
    blockNumber: number; observedAt: number; decisionDeadline: number;
  }): Promise<boolean>;
  verifyDecisionTx(input: { requestId: string; decisionHash: Hex; tx: Hex; anchoredAt: number }): Promise<boolean>;
}

export async function verifyEvidence(
  input: unknown,
  registry: KeyRegistry,
  chain: AnchorReader,
): Promise<VerificationReport> {
  const parsed = EvidenceBundleSchema.safeParse(input);
  if (!parsed.success) return { status: 'INVALID', errors: ['INVALID_EVIDENCE_SCHEMA'] };
  const bundle: EvidenceBundle = parsed.data;
  const errors: string[] = [];
  let chainMismatch = false;
  const { policy, request, verification_receipt: receipt, decision } = bundle;

  if (bundle.anchors.chain_id !== chain.chainId ||
      bundle.anchors.contract_address.toLowerCase() !== chain.address.toLowerCase()) {
    errors.push('INVALID_REQUEST_REFERENCE');
  }

  const signatures: Array<{ record: object; signature: string; key: string; error: string }> = [
    { record: policy, signature: 'enterprise_signature', key: policy.enterprise_key_id, error: 'INVALID_ENTERPRISE_SIGNATURE' },
    { record: request, signature: 'agent_signature', key: request.agent_key_id, error: 'INVALID_AGENT_SIGNATURE' },
    { record: receipt, signature: 'verification_signature', key: receipt.verification_key_id, error: 'INVALID_VERIFICATION_SIGNATURE' },
  ];
  if (decision) signatures.push({
    record: decision, signature: 'institution_signature', key: decision.institution_key_id, error: 'INVALID_INSTITUTION_SIGNATURE',
  });
  for (const { record, signature, key, error } of signatures) {
    const address = registry[key];
    if (!address || !await verifyRecordSignature(record, signature, address)) errors.push(error);
  }

  const policyHash = hashRecord(policy, 'enterprise_signature');
  const requestHash = hashRecord(request, 'agent_signature');
  const decisionHash = decision ? hashRecord(decision, 'institution_signature') : null;
  if (request.policy_hash !== policyHash || request.policy_id !== policy.policy_id || request.asset !== policy.asset ||
      receipt.policy_hash !== policyHash || (decision && (decision.policy_hash !== policyHash || decision.policy_id !== policy.policy_id))) {
    errors.push('POLICY_MISMATCH');
  }
  if (receipt.request_id !== request.request_id || receipt.request_hash !== requestHash ||
      receipt.request_anchor_tx !== bundle.anchors.request_tx ||
      (decision && (decision.request_id !== request.request_id || decision.request_hash !== requestHash))) {
    errors.push('INVALID_REQUEST_REFERENCE');
  }
  if ((decision && !bundle.anchors.decision_tx) || (!decision && bundle.anchors.decision_tx)) {
    errors.push('INVALID_REQUEST_REFERENCE');
  }

  const onChain = await chain.readRecord(request.request_id);
  if (!onChain.requestHash) {
    errors.push('INVALID_REQUEST_REFERENCE');
  } else {
    if (onChain.requestHash !== requestHash) {
      errors.push('REQUEST_HASH_MISMATCH');
      chainMismatch = true;
    }
    if (onChain.policyHash !== policyHash) {
      errors.push('POLICY_MISMATCH');
      chainMismatch = true;
    }
    if (receipt.observed_at !== onChain.requestAnchoredAt || receipt.decision_deadline !== onChain.decisionDeadline) {
      errors.push('INVALID_REQUEST_REFERENCE');
    }
    if (!await chain.verifyRequestTx({
      requestId: request.request_id, requestHash, policyHash, tx: bundle.anchors.request_tx as Hex,
      blockNumber: receipt.request_anchor_block, observedAt: receipt.observed_at,
      decisionDeadline: receipt.decision_deadline,
    })) errors.push('INVALID_REQUEST_REFERENCE');
    if (decisionHash !== onChain.decisionHash) {
      errors.push('DECISION_HASH_MISMATCH');
      chainMismatch = true;
    }
    if (onChain.decisionAnchoredAt !== null && onChain.decisionAnchoredAt > onChain.decisionDeadline) {
      errors.push('DEADLINE_EXPIRED');
    }
    if (decisionHash && bundle.anchors.decision_tx && onChain.decisionAnchoredAt !== null &&
        !await chain.verifyDecisionTx({
          requestId: request.request_id, decisionHash, tx: bundle.anchors.decision_tx as Hex,
          anchoredAt: onChain.decisionAnchoredAt,
        })) errors.push('INVALID_REQUEST_REFERENCE');
  }

  if (decision) {
    const exceeded = BigInt(request.amount_base_units) > BigInt(policy.max_amount_base_units);
    if (decision.decision !== (exceeded ? 'REJECT' : 'APPROVE') ||
        decision.reason_code !== (exceeded ? 'LIMIT_EXCEEDED' : 'WITHIN_LIMIT')) {
      errors.push('POLICY_MISMATCH');
    }
  }

  const uniqueErrors = [...new Set(errors)];
  if (chainMismatch) return { status: 'TAMPERED', errors: uniqueErrors };
  if (uniqueErrors.length > 0) return { status: 'INVALID', errors: uniqueErrors };
  if (!decision) {
    return (await chain.chainTime()) <= onChain.decisionDeadline
      ? { status: 'PROCESSING', errors: [] }
      : { status: 'MISSING', errors: ['MISSING_DECISION'] };
  }
  return { status: 'VERIFIED', errors: [] };
}
