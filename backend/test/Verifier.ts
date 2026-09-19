import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import hre from 'hardhat';
import { privateKeyToAccount } from 'viem/accounts';
import { AnchorClient, ChainAnchorReader } from '../src/blockchain/anchorClient.ts';
import { createPolicy } from '../src/enterprise/policy.ts';
import { createRequest } from '../src/agent/mockAgent.ts';
import { createReceipt } from '../src/verification/receipt.ts';
import { decideRequest } from '../src/institution/mockWallet.ts';
import { hashRecord, signRecord } from '../src/crypto/records.ts';
import { DecisionSchema, EvidenceBundleSchema } from '../src/records/schemas.ts';
import { verifyEvidence } from '../src/verification/verifier.ts';
import { verifyEvidenceFile } from '../src/verification/verifyFile.ts';

const enterprise = privateKeyToAccount(`0x${'0'.repeat(63)}1`);
const agent = privateKeyToAccount(`0x${'0'.repeat(63)}2`);
const institution = privateKeyToAccount(`0x${'0'.repeat(63)}3`);
const gatewaySigner = privateKeyToAccount(`0x${'0'.repeat(63)}4`);
const registry = {
  'enterprise-key-1': enterprise.address,
  'agent-key-1': agent.address,
  'institution-key-1': institution.address,
  'verification-key-1': gatewaySigner.address,
};

async function setup(withDecision = true, validFrom = '2026-09-19T00:00:00Z') {
  const { viem, networkHelpers } = await hre.network.create();
  const [writer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const contract = await viem.deployContract('DecisionAnchor', [writer.account.address]);
  const anchor = new AnchorClient(publicClient, writer, contract.address, await publicClient.getChainId());
  const policy = await createPolicy(enterprise, {
    policyId: 'payment-limit-v1', validFrom, maxAmountBaseUnits: '4000000000',
  });
  const request = await createRequest(agent, policy, {
    requestId: 'REQ-001', createdAt: '2026-09-19T01:00:00Z', amountBaseUnits: '4500000000',
    recipient: '0x1111111111111111111111111111111111111111',
  });
  const requestAnchor = await anchor.anchorRequest(request.request_id,
    hashRecord(request, 'agent_signature'), hashRecord(policy, 'enterprise_signature'));
  const receipt = await createReceipt(gatewaySigner, request, requestAnchor);
  const decision = withDecision ? await decideRequest(institution, request, policy, receipt, registry) : null;
  const decisionAnchor = decision ? await anchor.anchorDecision(request.request_id, hashRecord(decision, 'institution_signature')) : null;
  const bundle = EvidenceBundleSchema.parse({
    schema_version: 1, policy, request, verification_receipt: receipt, decision,
    anchors: {
      chain_id: anchor.chainId, contract_address: anchor.address, request_tx: requestAnchor.requestTx,
      ...(decisionAnchor ? { decision_tx: decisionAnchor.decisionTx } : {}),
    },
  });
  return { anchor, independentReader: new ChainAnchorReader(publicClient, contract.address, anchor.chainId), bundle, networkHelpers };
}

it('independently verifies a rejection from bundle, registry and chain', async () => {
  const { independentReader, bundle } = await setup();
  const result = await verifyEvidence(bundle, registry, independentReader);
  assert.deepEqual(result, { status: 'VERIFIED', errors: [] });
});

it('flags a newly signed alteration of the old decision as TAMPERED', async () => {
  const { anchor, bundle } = await setup();
  const changed = DecisionSchema.parse(await signRecord({
    ...bundle.decision!, reason_code: 'KYT_RISK', institution_signature: undefined,
  }, 'institution_signature', institution));
  const result = await verifyEvidence({ ...bundle, decision: changed }, registry, anchor);
  assert.equal(result.status, 'TAMPERED');
  assert.ok(result.errors.includes('DECISION_HASH_MISMATCH'));
});

it('uses chain time for PROCESSING and MISSING when no decision was anchored', async () => {
  const { anchor, bundle, networkHelpers } = await setup(false);
  assert.deepEqual(await verifyEvidence(bundle, registry, anchor), { status: 'PROCESSING', errors: [] });
  const deadline = (await anchor.readRecord('REQ-001')).decisionDeadline;
  await networkHelpers.time.increaseTo(deadline + 1);
  assert.deepEqual(await verifyEvidence(bundle, registry, anchor), { status: 'MISSING', errors: ['MISSING_DECISION'] });
});

it('rejects unregistered keys, wrong chain identity and malformed bundles', async () => {
  const { anchor, bundle } = await setup();
  assert.equal((await verifyEvidence(bundle, {}, anchor)).status, 'INVALID');
  assert.equal((await verifyEvidence({ ...bundle, anchors: { ...bundle.anchors, chain_id: 1 } }, registry, anchor)).status, 'INVALID');
  assert.deepEqual(await verifyEvidence({ ...bundle, request: {} }, registry, anchor), {
    status: 'INVALID', errors: ['INVALID_EVIDENCE_SCHEMA'],
  });
});

it('rejects bundle transaction references that point to different anchor operations', async () => {
  const { anchor, bundle } = await setup();
  const wrongRequestTx = bundle.anchors.decision_tx!;
  const forgedReceipt = await signRecord({
    ...bundle.verification_receipt, request_anchor_tx: wrongRequestTx, verification_signature: undefined,
  }, 'verification_signature', gatewaySigner);
  const wrongRequest = await verifyEvidence({
    ...bundle, verification_receipt: forgedReceipt,
    anchors: { ...bundle.anchors, request_tx: wrongRequestTx },
  }, registry, anchor);
  assert.equal(wrongRequest.status, 'INVALID');
  assert.ok(wrongRequest.errors.includes('INVALID_REQUEST_REFERENCE'));

  const wrongDecision = await verifyEvidence({
    ...bundle, anchors: { ...bundle.anchors, decision_tx: bundle.anchors.request_tx },
  }, registry, anchor);
  assert.equal(wrongDecision.status, 'INVALID');
  assert.ok(wrongDecision.errors.includes('INVALID_REQUEST_REFERENCE'));
});

it('verifies a downloaded JSON file with a separate static registry and read-only chain reader', async () => {
  const { independentReader, bundle } = await setup();
  const directory = await mkdtemp(join(tmpdir(), 'off-chase-verifier-'));
  try {
    const bundlePath = join(directory, 'evidence-bundle-REQ-001.json');
    const registryPath = join(directory, 'key-registry.json');
    await writeFile(bundlePath, JSON.stringify(bundle));
    await writeFile(registryPath, JSON.stringify(registry));
    assert.deepEqual(await verifyEvidenceFile(bundlePath, registryPath, independentReader), {
      status: 'VERIFIED', errors: [],
    });
    await writeFile(registryPath, JSON.stringify({ ...registry, 'institution-key-1': agent.address }));
    const wrongRegistry = await verifyEvidenceFile(bundlePath, registryPath, independentReader);
    assert.equal(wrongRegistry.status, 'INVALID');
    assert.ok(wrongRegistry.errors.includes('INVALID_INSTITUTION_SIGNATURE'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('does not accept a policy whose valid_from is after the signed request', async () => {
  const { independentReader, bundle } = await setup(false, '2026-09-20T00:00:00Z');
  const result = await verifyEvidence(bundle, registry, independentReader);
  assert.equal(result.status, 'INVALID');
  assert.ok(result.errors.includes('POLICY_MISMATCH'));
});
