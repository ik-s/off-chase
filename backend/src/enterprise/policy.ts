import type { PrivateKeyAccount } from 'viem/accounts';
import { signRecord } from '../crypto/records.ts';
import { PolicySchema, type PolicyRecord } from '../records/schemas.ts';

export async function createPolicy(account: PrivateKeyAccount, input: {
  policyId: string;
  validFrom: string;
  maxAmountBaseUnits: string;
}): Promise<PolicyRecord> {
  return PolicySchema.parse(await signRecord({
    schema_version: 1,
    policy_id: input.policyId,
    version: 1,
    asset: 'USDC',
    max_amount_base_units: input.maxAmountBaseUnits,
    valid_from: input.validFrom,
    enterprise_key_id: 'enterprise-key-1',
  }, 'enterprise_signature', account));
}
