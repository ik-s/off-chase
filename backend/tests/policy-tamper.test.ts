import assert from 'node:assert/strict';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { CaseService, type CaseStore, type Run } from '../src/api/cases.ts';
import { createPolicy } from '../src/enterprise/policy.ts';
import { createReceipt } from '../src/verification/receipt.ts';
import { decideRequest } from '../src/institution/mockWallet.ts';
import { hashRecord } from '../src/crypto/records.ts';
import type { EvidenceBundle, RequestRecord } from '../src/records/schemas.ts';
import type { GatewayService } from '../src/verification/service.ts';
import { verifyEvidence, type AnchorReader } from '../src/verification/verifier.ts';

async function setup() {
  const [enterprise, agent, institution, verification] = [1, 2, 3, 4].map(n => privateKeyToAccount(`0x${String(n).padStart(64, '0')}`));
  const registry = { 'enterprise-key-1': enterprise.address, 'agent-key-1': agent.address, 'institution-key-1': institution.address, 'verification-key-1': verification.address };
  const policy = await createPolicy(enterprise, { policyId: 'limit-v1', validFrom: '2026-01-01T00:00:00Z', maxAmountBaseUnits: '4000000000' });
  let original: EvidenceBundle;
  let run: Run;
  let task: Promise<void> | undefined;
  let writes = 0;
  const tx = `0x${'a'.repeat(64)}` as const;
  const chain: AnchorReader = {
    address: enterprise.address, chainId: 11155111, chainTime: async () => 100,
    readRecord: async () => ({ requestHash: hashRecord(original.request, 'agent_signature'), policyHash: original.request.policy_hash as `0x${string}`, requestAnchoredAt: 100, decisionDeadline: 130, decisionHash: hashRecord(original.decision!, 'institution_signature'), decisionAnchoredAt: 101 }),
    verifyRequestTx: async () => true, verifyDecisionTx: async () => true,
  };
  const store = {
    saveRun: async (value: Run) => { writes++; run = structuredClone(value); },
    getRun: async () => structuredClone(run), getBundle: async () => structuredClone(original),
    getCaseNumber: async () => 1, listBundles: async () => [structuredClone(original)],
  } as unknown as CaseStore;
  const gateway = {
    submitRequest: async (request: RequestRecord, options: Parameters<GatewayService['submitRequest']>[1]) => {
      const receipt = await createReceipt(verification, request, { requestTx: tx, blockNumber: 1n, observedAt: 100, decisionDeadline: 130 });
      const decision = await decideRequest(institution, request, policy, receipt, registry, options);
      await options?.captureDecision?.(decision);
      original = { schema_version: 1, policy, request, verification_receipt: receipt, decision, anchors: { chain_id: chain.chainId, contract_address: chain.address, request_tx: tx, decision_tx: tx } };
      return structuredClone(original);
    },
  } as unknown as GatewayService;
  const service = new CaseService(store, gateway, chain, input => verifyEvidence(input, registry, chain, true), agent, policy, institution.address, { waitUntil: pending => { task = pending; } });
  return { service, complete: async () => { await task; }, writes: () => writes, original: () => original, run: () => run, verify: (input: unknown) => verifyEvidence(input, registry, chain, true) };
}

test('3,500 request: lowered policy and rewritten reason fail verification while original remains verifiable', async () => {
  const fixture = await setup();
  const started = await fixture.service.start('tampered', '3500000000');
  await fixture.complete();
  assert.equal(fixture.run().status, 'complete');
  const detail = (await fixture.service.detail(started.id))!;
  assert.equal(detail.bundle.policy.max_amount_base_units, '3000000000');
  assert.equal(detail.bundle.decision?.reason_code, 'LIMIT_EXCEEDED');
  assert.equal(detail.originalBundle?.policy.max_amount_base_units, '4000000000');
  assert.equal(detail.originalBundle?.decision?.reason_code, 'KYT_RISK');
  assert.equal(detail.report.status, 'TAMPERED');
  assert.ok(detail.report.errors.includes('INVALID_ENTERPRISE_SIGNATURE'));
  assert.ok(detail.report.errors.includes('INVALID_INSTITUTION_SIGNATURE'));
  assert.equal((await fixture.verify(JSON.parse(JSON.stringify(fixture.original())))).status, 'VERIFIED');
  assert.equal(detail.change?.after, '제시된 정책 한도 3,000 USDC');
  assert.equal((await fixture.service.list())[0].status, 'TAMPERED');
});

test('tamper scenario rejects amounts outside the two limits before writing or starting execution', async () => {
  const fixture = await setup();
  for (const amount of ['1', '2999999999', '3000000000', '4000000000', '4500000000']) {
    await assert.rejects(fixture.service.start('tampered', amount), /POLICY_TAMPER_REQUIRES_BETWEEN_LIMITS_REQUEST/);
  }
  assert.equal(fixture.writes(), 0);
  for (const amount of ['3000000001', '3999999999']) {
    await fixture.service.start('tampered', amount);
    await fixture.complete();
    assert.equal(fixture.run().status, 'complete');
  }
});

test('legacy cases display the stored presented limit, not the new scenario limit', async () => {
  const fixture = await setup();
  const started = await fixture.service.start('tampered', '3500000000');
  await fixture.complete();
  fixture.run().submittedBundle!.policy.max_amount_base_units = '5000000000';
  assert.equal((await fixture.service.detail(started.id))?.change?.after, '제시된 정책 한도 5,000 USDC');
});
