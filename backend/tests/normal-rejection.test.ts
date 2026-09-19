import assert from 'node:assert/strict';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { hashRecord, verifyRecordSignature } from '../src/crypto/records.ts';
import { createPolicy } from '../src/enterprise/policy.ts';
import { createRequest } from '../src/agent/mockAgent.ts';
import { createReceipt } from '../src/verification/receipt.ts';
import { decideRequest } from '../src/institution/mockWallet.ts';

const enterprise = privateKeyToAccount(`0x${'0'.repeat(63)}1`);
const agent = privateKeyToAccount(`0x${'0'.repeat(63)}2`);
const institution = privateKeyToAccount(`0x${'0'.repeat(63)}3`);
const gateway = privateKeyToAccount(`0x${'0'.repeat(63)}4`);
const registry = {
  'enterprise-key-1': enterprise.address,
  'agent-key-1': agent.address,
  'institution-key-1': institution.address,
  'verification-key-1': gateway.address,
};

async function sample(amount: string) {
  const policy = await createPolicy(enterprise, {
    policyId: 'payment-limit-v1', validFrom: '2026-09-19T00:00:00Z', maxAmountBaseUnits: '4000000000',
  });
  const request = await createRequest(agent, policy, {
    requestId: 'REQ-001', createdAt: '2026-09-19T01:00:00Z', amountBaseUnits: amount,
    recipient: '0x1111111111111111111111111111111111111111',
  });
  const receipt = await createReceipt(gateway, request, {
    requestTx: `0x${'a'.repeat(64)}`, blockNumber: 123n, observedAt: 1789780000, decisionDeadline: 1789780030,
  });
  return { policy, request, receipt };
}

test('4,500 USDC against 4,000 USDC produces a signed REJECT / LIMIT_EXCEEDED', async () => {
  const { policy, request, receipt } = await sample('4500000000');
  assert.equal(request.policy_hash, hashRecord(policy, 'enterprise_signature'));
  assert.equal(receipt.request_hash, hashRecord(request, 'agent_signature'));
  const decision = await decideRequest(institution, request, policy, receipt, registry);
  assert.equal(decision.decision, 'REJECT');
  assert.equal(decision.reason_code, 'LIMIT_EXCEEDED');
  assert.equal(decision.policy_hash, request.policy_hash);
  assert.equal(await verifyRecordSignature(decision, 'institution_signature', institution.address), true);
});

test('amount at the limit is approved using integer units', async () => {
  const { policy, request, receipt } = await sample('4000000000');
  const decision = await decideRequest(institution, request, policy, receipt, registry);
  assert.equal(decision.decision, 'APPROVE');
  assert.equal(decision.reason_code, 'WITHIN_LIMIT');
});

test('institution refuses requests without the official gateway receipt', async () => {
  const { policy, request, receipt } = await sample('4500000000');
  await assert.rejects(decideRequest(institution, request, policy, null, registry), /UNVERIFIED_REQUEST/);
  await assert.rejects(decideRequest(institution, request, policy, { ...receipt, verification_key_id: 'unknown' }, registry), /UNVERIFIED_REQUEST/);
  await assert.rejects(decideRequest(institution, request, policy, { ...receipt, request_hash: `0x${'f'.repeat(64)}` }, registry), /UNVERIFIED_REQUEST/);
});

test('institution rejects policy or agent signature substitution', async () => {
  const { policy, request, receipt } = await sample('4500000000');
  await assert.rejects(decideRequest(institution, { ...request, policy_hash: `0x${'f'.repeat(64)}` }, policy, receipt, registry), /POLICY_MISMATCH/);
  await assert.rejects(decideRequest(institution, { ...request, amount_base_units: '1' }, policy, receipt, registry), /INVALID_AGENT_SIGNATURE/);
});
