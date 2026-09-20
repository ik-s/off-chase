import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createServer } from 'node:http';
import hre from 'hardhat';
import { privateKeyToAccount } from 'viem/accounts';
import { AnchorClient } from '../src/blockchain/anchorClient.ts';
import { createPolicy } from '../src/enterprise/policy.ts';
import { GatewayService } from '../src/verification/service.ts';
import { verifyEvidence } from '../src/verification/verifier.ts';
import { InMemoryEvidenceStore } from '../src/db/memoryEvidenceStore.ts';
import { CaseService, type Scenario } from '../src/api/cases.ts';
import { createApiApp } from '../src/api/app.ts';

it('real local-chain API runs normal, policy tampering, KYT and missing with durable stage data', async () => {
  const { viem, networkHelpers } = await hre.network.create();
  const [writer] = await viem.getWalletClients();
  const client = await viem.getPublicClient();
  const contract = await viem.deployContract('DecisionAnchor', [writer.account.address]);
  const anchor = new AnchorClient(client, writer, contract.address, await client.getChainId());
  const accounts = [1, 2, 3, 4].map(n => privateKeyToAccount(`0x${String(n).padStart(64, '0')}`));
  const [enterprise, agent, verification, institution] = accounts;
  const registry = { 'enterprise-key-1': enterprise.address, 'agent-key-1': agent.address, 'verification-key-1': verification.address, 'institution-key-1': institution.address };
  const policy = await createPolicy(enterprise, { policyId: 'integration-policy', validFrom: '2026-01-01T00:00:00Z', maxAmountBaseUnits: '4000000000' });
  const store = new InMemoryEvidenceStore([policy]);
  const gateway = new GatewayService(anchor, store, registry, verification, institution);
  const verify = (input: unknown) => verifyEvidence(input, registry, anchor, true);
  let activeRun: string | undefined;
  const tasks: Promise<void>[] = [];
  const control = {
    async acquire(id: string) { if (activeRun) throw new Error('DEMO_RUN_IN_PROGRESS'); activeRun = id; },
    async release(id: string) { if (activeRun === id) activeRun = undefined; },
    async isActive(id: string) { return activeRun === id; },
  };
  const execution = { control, waitUntil: (task: Promise<void>) => { tasks.push(task); } };
  const cases = new CaseService(store, gateway, anchor, verify, agent, policy, institution.address, execution);
  const otherInstance = new CaseService(store, gateway, anchor, verify, agent, policy, institution.address, execution);
  const server = createServer(createApiApp({ store, gateway, verify, cases, demosEnabled: true }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const ids: string[] = [];
  try {
    for (const scenario of ['normal', 'tampered', 'unknown', 'missing'] as Scenario[]) {
      const initial = await cases.start(scenario);
      assert.ok(tasks.length > 0, 'background work is registered with the serverless lifetime');
      assert.equal((await otherInstance.getRun(initial.id))?.status, 'running');
      await assert.rejects(otherInstance.start('normal'), /DEMO_RUN_IN_PROGRESS/);
      ids.push(initial.id);
      let run = await cases.getRun(initial.id);
      for (let n = 0; run?.status === 'running' && n < 200; n++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        run = await cases.getRun(initial.id);
      }
      assert.equal(run?.status, 'complete', JSON.stringify(run));
      await tasks[tasks.length - 1];
      assert.equal(activeRun, undefined);
      assert.deepEqual(run!.events.slice(0, 5).map(e => e.stage), ['agent_signed', 'gateway_received', 'request_validated', 'request_anchored', 'receipt_saved']);
      const detail = await cases.detail(initial.id);
      assert.ok(detail);
      assert.equal(detail.displayId, `REQ-${String(ids.length).padStart(3, '0')}`);
      assert.equal(detail.bundle.request.request_id, initial.id);
      const expected = scenario === 'tampered' ? 'TAMPERED' : scenario === 'missing' ? 'PROCESSING' : 'VERIFIED';
      assert.equal(detail.report.status, expected);
      assert.ok(detail.report.checks?.length);
      if (scenario === 'tampered') {
        assert.equal(detail.bundle.policy.max_amount_base_units, '3000000000');
        assert.equal((await store.getBundle(initial.id))!.policy.max_amount_base_units, '4000000000');
        assert.equal(detail.report.checks?.find(c => c.id === 'policy-anchor')?.state, 'failed');
      }
      if (scenario === 'unknown') {
        assert.equal(detail.bundle.decision?.reason_code, 'KYT_RISK');
        assert.equal(detail.report.checks?.find(c => c.id === 'policy')?.state, 'not-applicable');
        assert.equal(detail.report.checks?.find(c => c.id === 'institution-signature')?.state, 'passed');
      }
      if (scenario === 'missing') {
        await networkHelpers.time.increaseTo(detail.bundle.verification_receipt.decision_deadline);
        assert.equal((await verify(detail.bundle)).status, 'PROCESSING');
        await networkHelpers.time.increase(1);
        assert.equal((await verify(detail.bundle)).status, 'MISSING');
      }
      const exported = await fetch(`${url}/api/requests/${initial.id}/evidence`).then(r => r.json());
      const result = await fetch(`${url}/api/verifier`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ evidence: exported }) }).then(r => r.json()) as { status: string };
      assert.equal(result.status, scenario === 'missing' ? 'MISSING' : 'VERIFIED');
    }
    assert.equal((await cases.list()).length, 2);
    // A fresh service reads previous cases without inventing in-flight completion.
    const restarted = new CaseService(store, gateway, anchor, verify, agent, policy, institution.address);
    assert.equal((await restarted.list()).length, 2);
    const numbered = await restarted.list();
    for (const [index, id] of ids.entries()) {
      assert.equal((await restarted.detail(id))?.displayId, `REQ-${String(index + 1).padStart(3, '0')}`);
      assert.equal(numbered.some(item => item.id === id), index === 0 || index === 2);
    }
    await store.saveRun({ id: 'interrupted', requestId: 'interrupted', scenario: 'normal', status: 'running', events: [] });
    assert.equal((await restarted.getRun('interrupted'))?.error, 'RUN_INTERRUPTED_CHECK_EVIDENCE');
    const duplicate = await gateway.submitRequest((await store.getBundle(ids[0]))!.request);
    assert.equal(duplicate.request.request_id, ids[0]);
    assert.equal((await restarted.detail(ids[0]))?.displayId, 'REQ-001');
    for (const amount of ['1234567890', '4000000000', '4500000001']) {
      const response = await fetch(`${url}/api/test/requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amountBaseUnits: amount }) });
      assert.equal(response.status, 202);
      const initial = await response.json() as { id: string };
      let run = await cases.getRun(initial.id);
      for (let n = 0; run?.status === 'running' && n < 200; n++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        run = await cases.getRun(initial.id);
      }
      assert.equal(run?.status, 'complete', JSON.stringify(run));
      const detail = await cases.detail(initial.id);
      assert.equal(detail?.bundle.request.amount_base_units, amount);
      const decision = detail!.bundle.decision!;
      if (amount === '4500000001') assert.equal(decision.reason_code, 'LIMIT_EXCEEDED');
      else assert.equal(decision.reason_code, 'KYT_RISK');
      assert.equal(decision.decision, 'REJECT');
      assert.equal((await cases.list()).some(item => item.id === initial.id), decision.decision === 'REJECT');
      assert.equal(detail?.report.status, 'VERIFIED');
      assert.equal(detail?.label, detail?.bundle.decision?.reason_code === 'LIMIT_EXCEEDED' ? '한도 초과 거절' : detail?.bundle.decision?.reason_code === 'KYT_RISK' ? '알 수 없는 거절' : '한도 이내 승인');
      assert.ok(run?.events.some(event => event.stage === 'institution_dispatched'));
      assert.ok(run?.events.some(event => event.stage === 'response_received'));
    }
    await assert.rejects(cases.start('tampered', '4000000000'), /POLICY_TAMPER_REQUIRES_BELOW_LIMIT_REQUEST/);
    await assert.rejects(cases.start('tampered', '4500000000'), /POLICY_TAMPER_REQUIRES_BELOW_LIMIT_REQUEST/);
    const changedResponse = await fetch(`${url}/api/test/requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amountBaseUnits: '3500000000', policyTamper: true }) });
    assert.equal(changedResponse.status, 202);
    const changedRun = await changedResponse.json() as { id: string };
    let changed = await cases.getRun(changedRun.id);
    for (let n = 0; changed?.status === 'running' && n < 200; n++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      changed = await cases.getRun(changedRun.id);
    }
    assert.equal(changed?.status, 'complete', JSON.stringify(changed));
    const tampered = (await cases.detail(changedRun.id))!;
    assert.equal(tampered.bundle.request.amount_base_units, '3500000000');
    assert.equal(tampered.bundle.decision?.decision, 'REJECT');
    assert.equal(tampered.bundle.decision?.reason_code, 'KYT_RISK');
    assert.equal(tampered.originalBundle?.policy.max_amount_base_units, '4000000000');
    assert.equal(tampered.bundle.policy.max_amount_base_units, '5000000000');
    assert.equal(tampered.report.status, 'TAMPERED');
    assert.equal(tampered.report.checks?.find(check => check.id === 'policy-anchor')?.state, 'failed');
    assert.equal((await verify(tampered.originalBundle)).status, 'VERIFIED');
    const listed = (await cases.list()).find(item => item.id === changedRun.id);
    assert.equal(listed?.label, '정책 기록 변조');
    assert.equal(listed?.status, 'TAMPERED');
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
