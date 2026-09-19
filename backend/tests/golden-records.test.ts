import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { PolicySchema, RequestSchema, DecisionSchema, EvidenceBundleSchema } from '../src/records/schemas.ts';
import { hashRecord, signRecord, verifyRecordSignature, randomNonce } from '../src/crypto/records.ts';

function fixture(name: string): { record: Record<string, unknown>; expected_hash: `0x${string}` } {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
}

const policy = fixture('policy');
const request = fixture('request');
const decision = fixture('decision');
const enterprise = privateKeyToAccount(`0x${'0'.repeat(63)}1`);
const agent = privateKeyToAccount(`0x${'0'.repeat(63)}2`);
const institution = privateKeyToAccount(`0x${'0'.repeat(63)}3`);

test('golden records have stable canonical Keccak hashes and official signatures', async () => {
  const records = [
    [PolicySchema, policy, 'enterprise_signature', enterprise.address],
    [RequestSchema, request, 'agent_signature', agent.address],
    [DecisionSchema, decision, 'institution_signature', institution.address],
  ] as const;
  for (const [schema, item, signatureField, address] of records) {
    const record = schema.parse(item.record);
    assert.equal(hashRecord(record, signatureField), item.expected_hash);
    assert.equal(await verifyRecordSignature(record, signatureField, address), true);
  }
});

test('signatures bind the unsigned record to the registered role address', async () => {
  const signed = await signRecord({ ...policy.record, enterprise_signature: undefined }, 'enterprise_signature', enterprise);
  assert.equal(await verifyRecordSignature(signed, 'enterprise_signature', enterprise.address), true);
  assert.equal(await verifyRecordSignature(signed, 'enterprise_signature', agent.address), false);
  assert.equal(await verifyRecordSignature({ ...signed, max_amount_base_units: '5000000000' }, 'enterprise_signature', enterprise.address), false);
});

test('strict transport schemas reject floats, UI metadata and malformed links', () => {
  assert.equal(PolicySchema.safeParse(policy.record).success, true);
  assert.equal(RequestSchema.safeParse(request.record).success, true);
  assert.equal(DecisionSchema.safeParse(decision.record).success, true);
  assert.equal(RequestSchema.safeParse({ ...request.record, amount_base_units: 4500.5 }).success, false);
  assert.equal(RequestSchema.safeParse({ ...request.record, display_amount: '4,500' }).success, false);
  assert.equal(RequestSchema.safeParse({ ...request.record, policy_hash: '0x12' }).success, false);
  assert.equal(DecisionSchema.safeParse({ ...decision.record, decision: 'PENDING' }).success, false);
  assert.equal(EvidenceBundleSchema.safeParse({}).success, false);
});

test('request nonces are independent 32-byte random values', () => {
  const first = randomNonce();
  const second = randomNonce();
  assert.match(first, /^0x[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});
