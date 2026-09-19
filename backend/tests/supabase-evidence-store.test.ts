import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SupabaseEvidenceStore, type SupabaseEvidenceClient, type SupabaseQuery } from '../src/persistence/supabaseEvidenceStore.ts';
import type { EvidenceBundle } from '../src/records/schemas.ts';

const hash = `0x${'a'.repeat(64)}`;
const signature = `0x${'b'.repeat(130)}`;
const address = `0x${'1'.repeat(40)}`;

function bundle(): EvidenceBundle {
  const policy = {
    schema_version: 1 as const, policy_id: 'payment-limit-v1', version: 1,
    asset: 'USDC' as const, max_amount_base_units: '4000000000',
    valid_from: '2026-09-19T00:00:00Z', enterprise_key_id: 'enterprise-key-1', enterprise_signature: signature,
  };
  const request = {
    schema_version: 1 as const, request_id: 'REQ-001', created_at: '2026-09-19T01:00:00Z',
    asset: 'USDC' as const, amount_base_units: '4500000000', recipient: address,
    policy_id: policy.policy_id, policy_hash: hash, nonce: hash, agent_key_id: 'agent-key-1', agent_signature: signature,
  };
  const decision = {
    schema_version: 1 as const, request_id: request.request_id, request_hash: hash,
    policy_id: policy.policy_id, policy_hash: hash, decision: 'REJECT' as const,
    reason_code: 'LIMIT_EXCEEDED', institution_key_id: 'institution-key-1', institution_signature: signature,
  };
  return {
    schema_version: 1, policy, request,
    verification_receipt: {
      schema_version: 1, request_id: request.request_id, request_hash: hash, policy_hash: hash,
      request_anchor_tx: hash, request_anchor_block: 1, observed_at: 1, decision_deadline: 31,
      verification_key_id: 'verification-key-1', verification_signature: signature,
    },
    decision,
    anchors: { chain_id: 31337, contract_address: address, request_tx: hash, decision_tx: hash },
  };
}

class FakeQuery implements SupabaseQuery {
  private readonly rows: Map<string, Record<string, unknown>>;
  private selected: string | null = null;
  private filter: { column: string; value: string } | null = null;
  private deleting = false;
  constructor(rows: Map<string, Record<string, unknown>>) { this.rows = rows; }
  select(columns: string) { this.selected = columns; return this; }
  eq(column: string, value: string) { this.filter = { column, value }; return this; }
  async maybeSingle<T>(): Promise<{ data: T | null; error: null }> {
    const found = [...this.rows.values()].find((row) => !this.filter || row[this.filter.column] === this.filter.value);
    return { data: (found ?? null) as T | null, error: null };
  }
  async upsert(values: Record<string, unknown> | Array<Record<string, unknown>>): Promise<{ data: null; error: null }> {
    for (const row of Array.isArray(values) ? values : [values]) {
      const key = String(row.request_id ?? row.policy_id);
      this.rows.set(key, structuredClone(row));
    }
    return { data: null, error: null };
  }
  async insert(values: Record<string, unknown> | Array<Record<string, unknown>>): Promise<{ data: null; error: null }> {
    return this.upsert(values);
  }
  delete() { this.deleting = true; return this; }
  then<TResult1 = { data: null; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (this.deleting && this.filter) {
      for (const [key, row] of this.rows) if (row[this.filter.column] === this.filter.value) this.rows.delete(key);
    }
    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
  }
}

class FakeClient implements SupabaseEvidenceClient {
  readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  from(table: string) {
    if (!this.tables.has(table)) this.tables.set(table, new Map());
    return new FakeQuery(this.tables.get(table)!);
  }
}

describe('SupabaseEvidenceStore', () => {
  it('round-trips a bundle and stores independently addressable records', async () => {
    const client = new FakeClient();
    const store = new SupabaseEvidenceStore(client);
    const input = bundle();
    await store.saveBundle(input);

    assert.deepEqual(await store.getPolicy(input.policy.policy_id), input.policy);
    assert.deepEqual(await store.getBundle(input.request.request_id), input);
    assert.equal(client.tables.get('requests')?.size, 1);
    assert.equal(client.tables.get('anchors')?.size, 1);
  });

  it('deletes only the institution decision row while retaining the evidence bundle', async () => {
    const client = new FakeClient();
    const store = new SupabaseEvidenceStore(client);
    const input = bundle();
    await store.saveBundle(input);
    await store.saveDecision(input.decision!);
    await store.deleteInstitutionDecision(input.request.request_id);

    assert.equal(client.tables.get('decisions')?.size, 0);
    assert.deepEqual(await store.getBundle(input.request.request_id), input);
  });

  it('returns null for unknown policy and bundle IDs', async () => {
    const store = new SupabaseEvidenceStore(new FakeClient());
    assert.equal(await store.getPolicy('missing'), null);
    assert.equal(await store.getBundle('missing'), null);
  });
});
