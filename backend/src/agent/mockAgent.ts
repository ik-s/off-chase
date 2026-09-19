import type { PrivateKeyAccount } from 'viem/accounts';
import { hashRecord, randomNonce, signRecord } from '../crypto/records.ts';
import { RequestSchema, type PolicyRecord, type RequestRecord } from '../records/schemas.ts';

export async function createRequest(account: PrivateKeyAccount, policy: PolicyRecord, input: {
  requestId: string;
  createdAt: string;
  amountBaseUnits: string;
  recipient: `0x${string}`;
}): Promise<RequestRecord> {
  return RequestSchema.parse(await signRecord({
    schema_version: 1,
    request_id: input.requestId,
    created_at: input.createdAt,
    asset: 'USDC',
    amount_base_units: input.amountBaseUnits,
    recipient: input.recipient,
    policy_id: policy.policy_id,
    policy_hash: hashRecord(policy, 'enterprise_signature'),
    nonce: randomNonce(),
    agent_key_id: 'agent-key-1',
  }, 'agent_signature', account));
}
