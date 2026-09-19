import type { Hex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { hashRecord, signRecord } from '../crypto/records.ts';
import { VerificationReceiptSchema, type RequestRecord, type VerificationReceipt } from '../records/schemas.ts';

export async function createReceipt(account: PrivateKeyAccount, request: RequestRecord, anchor: {
  requestTx: Hex;
  blockNumber: bigint;
  observedAt: number;
  decisionDeadline: number;
}): Promise<VerificationReceipt> {
  const blockNumber = Number(anchor.blockNumber);
  if (!Number.isSafeInteger(blockNumber)) throw new Error('INVALID_ANCHOR_BLOCK');
  return VerificationReceiptSchema.parse(await signRecord({
    schema_version: 1,
    request_id: request.request_id,
    request_hash: hashRecord(request, 'agent_signature'),
    policy_hash: request.policy_hash,
    request_anchor_tx: anchor.requestTx,
    request_anchor_block: blockNumber,
    observed_at: anchor.observedAt,
    decision_deadline: anchor.decisionDeadline,
    verification_key_id: 'verification-key-1',
  }, 'verification_signature', account));
}
