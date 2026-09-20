import assert from 'node:assert/strict';
import { it } from 'node:test';
import hre from 'hardhat';
import { privateKeyToAccount } from 'viem/accounts';
import { AnchorClient, ChainAnchorReader } from '../src/blockchain/anchorClient.ts';
import { createPolicy } from '../src/enterprise/policy.ts';
import { createRequest } from '../src/agent/mockAgent.ts';
import { decideRequest } from '../src/institution/mockWallet.ts';
import { hashRecord } from '../src/crypto/records.ts';
import { verifyEvidence } from '../src/verification/verifier.ts';
import { GatewayService, type EvidenceStore } from '../src/verification/service.ts';
import type { EvidenceBundle, PolicyRecord, DecisionRecord } from '../src/records/schemas.ts';

const enterprise = privateKeyToAccount(`0x${'0'.repeat(63)}1`);
const agent = privateKeyToAccount(`0x${'0'.repeat(63)}2`);
const institution = privateKeyToAccount(`0x${'0'.repeat(63)}3`);
const gatewaySigner = privateKeyToAccount(`0x${'0'.repeat(63)}4`);
const registry = {
  'enterprise-key-1': enterprise.address, 'agent-key-1': agent.address,
  'institution-key-1': institution.address, 'verification-key-1': gatewaySigner.address,
};

class MemoryStore implements EvidenceStore {
  policy: PolicyRecord | null = null;
  bundles = new Map<string, EvidenceBundle>();
  decisions = new Map<string, DecisionRecord>();
  async getPolicy(id: string) { return this.policy?.policy_id === id ? this.policy : null; }
  async getBundle(id: string) { return this.bundles.get(id) ?? null; }
  async saveBundle(bundle: EvidenceBundle) { this.bundles.set(bundle.request.request_id, structuredClone(bundle)); }
  async saveDecision(decision: DecisionRecord) { this.decisions.set(decision.request_id, structuredClone(decision)); }
  async deleteInstitutionDecision(id: string) { this.decisions.delete(id); }
}

async function setup() {
  const { viem, networkHelpers } = await hre.network.create();
  const [writer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const contract = await viem.deployContract('DecisionAnchor', [writer.account.address]);
  const chainId = await publicClient.getChainId();
  const anchor = new AnchorClient(publicClient, writer, contract.address, chainId);
  const reader = new ChainAnchorReader(publicClient, contract.address, chainId);
  const store = new MemoryStore();
  store.policy = await createPolicy(enterprise, {
    policyId: 'payment-limit-v1', validFrom: '2026-09-19T00:00:00Z', maxAmountBaseUnits: '4000000000',
  });
  const gateway = new GatewayService(anchor, store, registry, gatewaySigner, institution);
  const request = await createRequest(agent, store.policy, {
    requestId: 'REQ-001', createdAt: '2026-09-19T01:00:00Z', amountBaseUnits: '4500000000',
    recipient: '0x1111111111111111111111111111111111111111',
  });
  return { gateway, anchor, store, reader, request, networkHelpers };
}

it('gateway anchors signed request before mock institution decision and exports a verifiable bundle', async () => {
  const { gateway, store, reader, request } = await setup();
  const bundle = await gateway.submitRequest(request);
  assert.equal(bundle.decision?.decision, 'REJECT');
  assert.equal(bundle.decision?.reason_code, 'LIMIT_EXCEEDED');
  assert.equal(store.decisions.has(request.request_id), true);
  assert.deepEqual(await verifyEvidence(bundle, registry, reader), { status: 'VERIFIED', errors: [] });
});

it('same signed request is idempotent; a different hash with the same ID conflicts', async () => {
  const { gateway, store, request } = await setup();
  const first = await gateway.submitRequest(request);
  const second = await gateway.submitRequest(request);
  assert.deepEqual(second, first);
  const changed = await createRequest(agent, store.policy!, {
    requestId: request.request_id, createdAt: request.created_at, amountBaseUnits: '4500000001',
    recipient: request.recipient as `0x${string}`,
  });
  await assert.rejects(gateway.submitRequest(changed), /REQUEST_ID_CONFLICT/);
});

it('missing demo remains PROCESSING until chain deadline and then becomes MISSING', async () => {
  const { gateway, reader, request, networkHelpers } = await setup();
  const bundle = await gateway.submitRequest(request, { omitDecision: true });
  assert.equal(bundle.decision, null);
  assert.deepEqual(await verifyEvidence(bundle, registry, reader), { status: 'PROCESSING', errors: [] });
  await networkHelpers.time.increaseTo(bundle.verification_receipt.decision_deadline + 1);
  assert.deepEqual(await verifyEvidence(bundle, registry, reader), { status: 'MISSING', errors: ['MISSING_DECISION'] });
});

it('recovers an already anchored decision after the deadline without rebroadcasting', async () => {
  const { gateway, anchor, store, request, networkHelpers } = await setup();
  const pending = await gateway.submitRequest(request, { omitDecision: true });
  const decision = await decideRequest(institution, request, store.policy!, pending.verification_receipt, registry);
  const anchored = await anchor.anchorDecision(request.request_id, hashRecord(decision, 'institution_signature'));
  await networkHelpers.time.increaseTo(pending.verification_receipt.decision_deadline + 1);
  const recovered = await gateway.submitDecision(decision);
  assert.equal(recovered.anchors.decision_tx, anchored.decisionTx);
});

it('downloaded evidence stays verifiable after the institution decision row is deleted', async () => {
  const { gateway, store, reader, request } = await setup();
  const downloaded = structuredClone(await gateway.submitRequest(request));
  await store.deleteInstitutionDecision(request.request_id);
  assert.equal(store.decisions.has(request.request_id), false);
  assert.deepEqual(await verifyEvidence(downloaded, registry, reader), { status: 'VERIFIED', errors: [] });
});

it('rejects modified agent request before anchoring', async () => {
  const { gateway, reader, request } = await setup();
  await assert.rejects(gateway.submitRequest({ ...request, amount_base_units: '1' }), /INVALID_AGENT_SIGNATURE/);
  assert.equal((await reader.readRecord(request.request_id)).requestHash, null);
});
