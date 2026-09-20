import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryEvidenceStore } from '../src/db/memoryEvidenceStore.ts';

test('in-memory evidence store returns saved bundles and keeps policy lookup separate', async () => {
  const policy = { policy_id: 'payment-limit-v1' } as never;
  const bundle = { request: { request_id: 'REQ-001' } } as never;
  const store = new InMemoryEvidenceStore([policy]);
  assert.equal(await store.getPolicy('payment-limit-v1'), policy);
  assert.equal(await store.getBundle('REQ-001'), null);
  await store.saveBundle(bundle);
  assert.equal(await store.getBundle('REQ-001'), bundle);
});
