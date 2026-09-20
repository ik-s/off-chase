import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpRepository } from '../src/data/http.ts';

test('HTTP repository formats exact base units and sends evidence in API envelope', async () => {
  const calls: Array<{ url: string; body?: BodyInit | null }> = [];
  const repository = createHttpRepository('/api', async (input, init) => {
    calls.push({ url: String(input), body: init?.body });
    return new Response(JSON.stringify(String(input).endsWith('/cases') ? [{ id: 'live', displayId: 'REQ-001', amountBaseUnits: '3500000000', decision: 'REJECT', status: 'VERIFIED', label: '알 수 없는 거절' }] : { status: 'INVALID', errors: ['INVALID_EVIDENCE_SCHEMA'], checks: [] }));
  });
  const [item] = await repository.listCases();
  assert.equal(item.amount, '3,500');
  assert.equal(item.displayId, 'REQ-001');
  assert.equal(item.id, 'live');
  assert.equal((await repository.verifyEvidence({ arbitrary: true })).kind, 'report');
  assert.deepEqual(JSON.parse(String(calls[1].body)), { evidence: { arbitrary: true } });
});

test('API failures never fall back to fixtures or invented verification', async () => {
  const repository = createHttpRepository('/api', async () => new Response(JSON.stringify({ error: 'DATABASE_UNAVAILABLE' }), { status: 503 }));
  await assert.rejects(repository.listCases(), /503.*DATABASE_UNAVAILABLE/);
  await assert.rejects(repository.verifyEvidence({}), /503/);
});

test('malformed successful responses are rejected by the data boundary', async () => {
  const repository = createHttpRepository('/api', async () => new Response(JSON.stringify({ status: 'VERIFIED' })));
  await assert.rejects(repository.getCase('case'));
  await assert.rejects(repository.verifyEvidence({}));
});

test('manual request posts exact base units and reports server progress', async () => {
  const calls: { path: string; body: unknown }[] = [];
  const repository = createHttpRepository('/api', async (input, init) => {
    calls.push({ path: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ id: 'run-1', requestId: 'request-1', scenario: 'normal', status: 'complete', decision: 'APPROVE', reasonCode: 'WITHIN_LIMIT', events: [{ stage: 'response_received', at: '2026-09-20T12:00:00Z' }] }));
  });
  const stages: string[] = [];
  const id = await repository.submitTestRequest!('3500123456', run => {
    assert.equal(run.decision, 'APPROVE');
    assert.equal(run.reasonCode, 'WITHIN_LIMIT');
    stages.push(...run.events.map(event => event.stage));
  });
  assert.equal(id, 'request-1');
  assert.deepEqual(calls, [{ path: '/api/test/requests', body: { amountBaseUnits: '3500123456', policyTamper: false } }]);
  assert.deepEqual(stages, ['response_received']);
  await repository.submitTestRequest!('3500000000', undefined, undefined, true);
  assert.deepEqual(calls[1], { path: '/api/test/requests', body: { amountBaseUnits: '3500000000', policyTamper: true } });
});
