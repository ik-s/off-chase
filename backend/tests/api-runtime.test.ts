import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type { EvidenceBundle } from '../src/records/schemas.ts';
import { createApiApp } from '../src/api/app.ts';

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
