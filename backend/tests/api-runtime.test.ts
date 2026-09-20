import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type { EvidenceBundle } from '../src/records/schemas.ts';
import { createApiApp } from '../src/api/app.ts';
import type { CaseService } from '../src/api/cases.ts';

const bundle = {
  schema_version: 1,
  policy: {}, request: { request_id: 'REQ-001' }, verification_receipt: {}, decision: null,
  anchors: {},
} as EvidenceBundle;

async function withServer<T>(app: ReturnType<typeof createApiApp>, run: (url: string) => Promise<T>): Promise<T> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('SERVER_NOT_LISTENING');
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function app(overrides: Partial<Parameters<typeof createApiApp>[0]> = {}) {
  return createApiApp({
    gateway: {
      submitRequest: async () => bundle,
      submitDecision: async () => bundle,
    },
    store: { getBundle: async () => bundle },
    verify: async () => ({ status: 'VERIFIED', errors: [] }),
    ...overrides,
  });
}

test('live case API keeps missing resources and disabled demos distinct from verification status', async () => {
  let started = false;
  const cases = {
    list: async () => [], detail: async () => null, getRun: async () => null,
    start: async () => { started = true; return {}; },
  } as unknown as CaseService;
  await withServer(app({ cases }), async url => {
    assert.deepEqual(await fetch(`${url}/api/cases`).then(r => r.json()), []);
    assert.equal((await fetch(`${url}/api/cases/missing`)).status, 404);
    assert.equal((await fetch(`${url}/api/demo/runs/missing`)).status, 404);
    const denied = await fetch(`${url}/api/demo/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: 'normal' }) });
    assert.equal(denied.status, 404);
    assert.equal(started, false);
  });
});

test('runtime does not turn infrastructure errors into INVALID verification results', async () => {
  await withServer(app({ verify: async () => { throw new Error('RPC provider timed out'); } }), async url => {
    const response = await fetch(`${url}/api/verifier`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ evidence: {} }) });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'INTERNAL_ERROR' });
  });
});

test('manual test requests validate amounts and retain local-only mutation guards', async () => {
  let calls = 0;
  const cases = { start: async (_scenario: string, amount: string) => { calls++; return { amount }; } } as unknown as CaseService;
  const submit = (url: string, amount: unknown, extra = {}) => fetch(`${url}/api/test/requests`, { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify({ amountBaseUnits: amount }) });
  await withServer(app({ cases }), async url => { assert.equal((await submit(url, '1000000')).status, 403); });
  await withServer(app({ cases, demosEnabled: true }), async url => {
    assert.equal((await submit(url, '1000000', { 'sec-fetch-site': 'cross-site' })).status, 403);
    for (const value of ['0', '-1', '1.5', '1e6', '9'.repeat(31), 3500000000]) assert.equal((await submit(url, value)).status, 400);
    assert.equal(calls, 0);
    assert.equal((await submit(url, '3500123456')).status, 202);
    assert.equal(calls, 1);
  });
});

test('accepts gateway requests and returns the evidence bundle', async () => {
  await withServer(app(), async (url) => {
    const response = await fetch(`${url}/api/requests`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: { example: true } }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), bundle);
  });
});

test('downloads an evidence bundle as a JSON attachment', async () => {
  await withServer(app(), async (url) => {
    const response = await fetch(`${url}/api/requests/REQ-001/evidence`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition') ?? '', /evidence-bundle-REQ-001\.json/);
    assert.deepEqual(await response.json(), bundle);
  });
});

test('reports verifier results and maps known domain errors to client responses', async () => {
  const failing = app({
    gateway: { submitRequest: async () => { throw new Error('INVALID_AGENT_SIGNATURE'); }, submitDecision: async () => bundle },
    verify: async () => ({ status: 'TAMPERED', errors: ['DECISION_HASH_MISMATCH'] }),
  });
  await withServer(failing, async (url) => {
    const rejected = await fetch(`${url}/api/requests`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: {} }),
    });
    assert.equal(rejected.status, 400);
    assert.deepEqual(await rejected.json(), { error: 'INVALID_AGENT_SIGNATURE' });
    const verified = await fetch(`${url}/api/verifier`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ evidence: {} }),
    });
    assert.deepEqual(await verified.json(), { status: 'TAMPERED', errors: ['DECISION_HASH_MISMATCH'] });
  });
});

test('maps duplicate record conflicts to HTTP 409', async () => {
  const duplicate = app({
    gateway: { submitRequest: async () => { throw new Error('REQUEST_ID_CONFLICT'); }, submitDecision: async () => bundle },
  });
  await withServer(duplicate, async (url) => {
    const response = await fetch(`${url}/api/requests`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: {} }),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'REQUEST_ID_CONFLICT' });
  });
});
