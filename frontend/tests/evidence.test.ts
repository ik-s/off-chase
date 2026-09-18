import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMockRepository, missingStatus } from '../src/data/mock.ts';
import { EvidenceBundleSchema } from '../src/data/records.ts';
import { formatUsdc } from '../src/data/presentation.ts';
import { initialState, workspaceReducer } from '../src/state.ts';
import type { EvidenceRepository } from '../src/data/types.ts';

const repo = () => createMockRepository({ clock: () => 0, latency: 0 });

test('USDC display preserves six decimals and values above Number safe integer', () => {
  assert.equal(formatUsdc('4500000000'), '4,500');
  assert.equal(formatUsdc('4000000000'), '4,000');
  assert.equal(formatUsdc('1'), '0.000001');
  assert.equal(formatUsdc('1234500'), '1.2345');
  assert.equal(formatUsdc('9007199254740993123456'), '9,007,199,254,740,993.123456');
});

test('initial cases cover all five verification states', async () => {
  const items = await repo().listCases();
  assert.deepEqual(new Set(items.map(c => c.status)), new Set(['VERIFIED', 'TAMPERED', 'MISSING', 'PROCESSING', 'INVALID']));
  assert.equal(items[0].id, 'REQ-001');
  assert.equal(items[0].decision, 'REJECT');
  assert.equal(items[0].status, 'VERIFIED');
});

test('records preserve transport fields; metadata never enters downloaded bundle', async () => {
  const source = repo();
  const download = await source.downloadEvidence('REQ-001');
  assert.equal(download.filename, 'evidence-bundle-REQ-001.json');
  const bundle = EvidenceBundleSchema.parse(JSON.parse(download.content));
  assert.equal(bundle.request.amount_base_units, '4500000000');
  assert.equal(bundle.policy.max_amount_base_units, '4000000000');
  assert.equal(bundle.decision?.reason_code, 'LIMIT_EXCEEDED');
  assert.deepEqual(Object.keys(bundle), ['schema_version', 'policy', 'request', 'verification_receipt', 'decision', 'anchors']);
  assert.equal('status' in bundle, false);
  assert.equal(bundle.verification_receipt.decision_deadline - bundle.verification_receipt.observed_at, 30);
  assert.equal((await source.verifyEvidence(bundle)).kind, 'report');
});

test('schemas reject numeric amounts, missing fields and UI metadata', async () => {
  const { bundle } = await repo().getCase('REQ-001');
  assert.equal(EvidenceBundleSchema.safeParse({ ...bundle, status: 'VERIFIED' }).success, false);
  assert.equal(EvidenceBundleSchema.safeParse({ ...bundle, request: { ...bundle.request, amount_base_units: 4500000000 } }).success, false);
  assert.equal(EvidenceBundleSchema.safeParse({ ...bundle, policy: {} }).success, false);
});

test('fixture download/upload reports expected states, with JSON key order ignored', async () => {
  const source = repo();
  for (const item of await source.listCases()) {
    const bundle = JSON.parse((await source.downloadEvidence(item.id)).content);
    const reordered = Object.fromEntries(Object.entries(bundle).reverse());
    const outcome = await source.verifyEvidence(reordered);
    assert.equal(outcome.kind, 'report');
    if (outcome.kind === 'report') assert.equal(outcome.report.status, item.status);
  }
});

test('browser upload sample matches the exported normal bundle', async () => {
  const sample = JSON.parse(await readFile(new URL('./fixtures/normal.json', import.meta.url), 'utf8'));
  const result = await repo().verifyEvidence(sample);
  assert.equal(result.kind, 'report');
  if (result.kind === 'report') assert.equal(result.report.status, 'VERIFIED');
});

test('unknown or edited evidence never receives a simulated success', async () => {
  const source = repo();
  const { bundle } = await source.getCase('REQ-001');
  bundle.request.amount_base_units = '1';
  assert.equal((await source.verifyEvidence(bundle)).kind, 'unsupported');
  const outcome = await source.verifyEvidence({ schema_version: 1 });
  assert.equal(outcome.kind, 'report');
  if (outcome.kind === 'report') {
    assert.equal(outcome.report.status, 'INVALID');
    assert.deepEqual(outcome.report.errors, ['INVALID_EVIDENCE_SCHEMA']);
  }
});

test('tampered demo retains prior anchor and exposes changed reason plus all errors', async () => {
  const source = repo();
  const normal = await source.getCase('REQ-001');
  const altered = await source.getCase(await source.runDemo('tampered'));
  assert.deepEqual(altered.change, { before: 'LIMIT_EXCEEDED', after: 'KYT_RISK' });
  assert.equal(altered.report.status, 'TAMPERED');
  assert.equal(altered.decisionAnchor?.hash, normal.decisionAnchor?.hash);
  assert.ok(altered.report.errors.includes('DECISION_HASH_MISMATCH'));
  assert.ok(altered.report.errors.includes('POLICY_MISMATCH'));
  assert.equal((await source.getCase('REQ-001')).bundle.decision?.reason_code, 'LIMIT_EXCEEDED');
});

test('missing decision boundary uses injected mock chain time, equality is PROCESSING', async () => {
  assert.equal(missingStatus(29, 30), 'PROCESSING');
  assert.equal(missingStatus(30, 30), 'PROCESSING');
  assert.equal(missingStatus(31, 30), 'MISSING');
  let time = 0;
  const source = createMockRepository({ clock: () => time, latency: 0 });
  const id = await source.runDemo('missing');
  assert.equal((await source.getCase(id)).report.status, 'PROCESSING');
  time = 25;
  assert.equal((await source.getCase(id)).report.status, 'PROCESSING');
  time = 26;
  const missing = await source.getCase(id);
  assert.equal(missing.report.status, 'MISSING');
  assert.equal(missing.bundle.decision, null);
  assert.equal(missing.bundle.anchors.decision_tx, undefined);
  assert.equal(missing.decisionAnchor, null);
  assert.equal(EvidenceBundleSchema.safeParse(missing.bundle).success, true);
});

test('deleted institution row does not remove retained evidence', async () => {
  const source = repo();
  const id = await source.runDemo('deleted');
  const detail = await source.getCase(id);
  assert.equal(detail.institutionRecordPresent, false);
  assert.ok(detail.bundle.decision);
  assert.ok(detail.decisionAnchor);
  const result = await source.verifyEvidence(JSON.parse((await source.downloadEvidence(id)).content));
  assert.equal(result.kind, 'report');
  if (result.kind === 'report') assert.equal(result.report.status, 'VERIFIED');
});

test('returned objects and separate repository sessions cannot mutate each other', async () => {
  const source = repo();
  const detail = await source.getCase('REQ-001');
  detail.bundle.policy.max_amount_base_units = '1';
  assert.equal((await source.getCase('REQ-001')).bundle.policy.max_amount_base_units, '4000000000');
  await source.runDemo('normal');
  assert.equal((await repo().listCases()).length, 5);
});

test('list loading and filtering never auto-select a request; stale detail is ignored', async () => {
  const source = repo();
  const cases = await source.listCases();
  let state = workspaceReducer(initialState, { type: 'list', cases });
  assert.equal(state.selectedId, null);
  state = workspaceReducer(state, { type: 'list', cases });
  assert.equal(state.selectedId, null);
  state = workspaceReducer(state, { type: 'filter', filter: 'MISSING' });
  assert.equal(state.selectedId, null);
  state = workspaceReducer(state, { type: 'select', id: 'REQ-003' });
  assert.equal(state.selectedId, 'REQ-003');
  state = workspaceReducer(state, { type: 'detail', id: 'REQ-001', detail: await source.getCase('REQ-001') });
  assert.equal(state.detail, null);
  state = workspaceReducer(state, { type: 'detail', id: 'REQ-003', detail: await source.getCase('REQ-003') });
  assert.equal(state.evidence, 'verification_receipt');
  state = workspaceReducer(state, { type: 'list', cases: [] });
  assert.equal(state.selectedId, null);
  assert.equal(state.detail, null);
});

test('refresh preserves evidence selection, new demo clears incompatible filter', async () => {
  const source = repo();
  const cases = await source.listCases();
  const detail = await source.getCase('REQ-001');
  let state = workspaceReducer(initialState, { type: 'list', cases });
  state = workspaceReducer(state, { type: 'select', id: 'REQ-001' });
  state = workspaceReducer(state, { type: 'detail', id: 'REQ-001', detail });
  state = workspaceReducer(state, { type: 'evidence', evidence: 'policy' });
  state = workspaceReducer(state, { type: 'detail', id: 'REQ-001', detail });
  assert.equal(state.evidence, 'policy');
  state = workspaceReducer(state, { type: 'filter', filter: 'TAMPERED' });
  const id = await source.runDemo('normal');
  state = workspaceReducer(state, { type: 'list', cases: await source.listCases(), preferredId: id });
  assert.equal(state.filter, 'ALL');
  assert.equal(state.selectedId, id);
});

test('UI state accepts an alternate repository port without Mock imports or changes', async () => {
  const detail = await repo().getCase('REQ-001');
  const alternate: EvidenceRepository = {
    mode: 'api',
    async listCases() { return [{ id: 'OTHER', amount: '4,500', decision: 'REJECT', status: 'VERIFIED', label: 'Alternate adapter' }]; },
    async getCase() { return { ...detail, bundle: { ...detail.bundle, request: { ...detail.bundle.request, request_id: 'OTHER' } } }; },
    async downloadEvidence() { throw new Error('Unavailable'); },
    async verifyEvidence() { return { kind: 'unsupported', message: 'Awaiting contract' }; },
    async runDemo() { throw new Error('Unavailable'); },
  };
  let state = workspaceReducer(initialState, { type: 'list', cases: await alternate.listCases() });
  assert.equal(state.selectedId, null);
  state = workspaceReducer(state, { type: 'select', id: 'OTHER' });
  state = workspaceReducer(state, { type: 'detail', id: 'OTHER', detail: await alternate.getCase('OTHER') });
  assert.equal(state.selectedId, 'OTHER');
  assert.equal(state.detail?.bundle.request.request_id, 'OTHER');
  state = workspaceReducer(state, { type: 'detail-error', id: 'OTHER', error: 'Network unavailable' });
  assert.equal(state.load, 'error');
  assert.equal(state.detail?.report.status, 'VERIFIED');
});
