import { createClient } from '@supabase/supabase-js';
import type { EvidenceStore } from '../verification/service.ts';
import {
  EvidenceBundleSchema,
  DecisionSchema,
  PolicySchema,
  type DecisionRecord,
  type EvidenceBundle,
  type PolicyRecord,
} from '../records/schemas.ts';

type QueryResult<T> = { data: T; error: { message: string } | null };

export interface SupabaseQuery {
  select(columns: string): SupabaseQuery;
  eq(column: string, value: string): SupabaseQuery;
  maybeSingle<T = unknown>(): Promise<QueryResult<T | null>>;
  insert(values: Record<string, unknown> | Array<Record<string, unknown>>): Promise<QueryResult<unknown>>;
  upsert(values: Record<string, unknown> | Array<Record<string, unknown>>, options?: { onConflict?: string }): Promise<QueryResult<unknown>>;
  delete(): SupabaseQuery;
  then<TResult1 = QueryResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
}

export interface SupabaseEvidenceClient {
  from(table: string): SupabaseQuery;
}

interface JsonRow {
  request_id?: string;
  policy_id?: string;
  record: unknown;
}

interface BundleRow extends JsonRow {
  request_id: string;
  policy_id: string;
}

function ensure<T>(result: QueryResult<T>, operation: string): T {
  if (result.error) throw new Error(`SUPABASE_${operation}_FAILED: ${result.error.message}`);
  return result.data;
}

function asRecord<T>(value: unknown, schema: { parse(input: unknown): T }): T {
  return schema.parse(value);
}

export class SupabaseEvidenceStore implements EvidenceStore {
  private readonly client: SupabaseEvidenceClient;

  constructor(client: SupabaseEvidenceClient) {
    this.client = client;
  }

  async getPolicy(policyId: string): Promise<PolicyRecord | null> {
    const row = ensure(await this.client.from('policies').select('record').eq('policy_id', policyId).maybeSingle<JsonRow>(), 'GET_POLICY');
    return row ? asRecord(row.record, PolicySchema) : null;
  }

  async getBundle(requestId: string): Promise<EvidenceBundle | null> {
    const row = ensure(await this.client.from('evidence_bundles').select('record').eq('request_id', requestId).maybeSingle<BundleRow>(), 'GET_BUNDLE');
    return row ? asRecord(row.record, EvidenceBundleSchema) : null;
  }

  async saveBundle(bundle: EvidenceBundle): Promise<void> {
    const parsed = EvidenceBundleSchema.parse(bundle);
    const requestId = parsed.request.request_id;
    ensure(await this.client.from('policies').upsert({
      policy_id: parsed.policy.policy_id,
      record: parsed.policy,
    }, { onConflict: 'policy_id' }), 'SAVE_POLICY');
    ensure(await this.client.from('requests').upsert({
      request_id: requestId,
      policy_id: parsed.request.policy_id,
      record: parsed.request,
    }, { onConflict: 'request_id' }), 'SAVE_REQUEST');
    ensure(await this.client.from('verification_receipts').upsert({
      request_id: requestId,
      record: parsed.verification_receipt,
    }, { onConflict: 'request_id' }), 'SAVE_RECEIPT');
    ensure(await this.client.from('anchors').upsert({
      request_id: requestId,
      chain_id: parsed.anchors.chain_id,
      contract_address: parsed.anchors.contract_address,
      request_tx: parsed.anchors.request_tx,
      decision_tx: parsed.anchors.decision_tx ?? null,
    }, { onConflict: 'request_id' }), 'SAVE_ANCHOR');
    ensure(await this.client.from('evidence_bundles').upsert({
      request_id: requestId,
      policy_id: parsed.policy.policy_id,
      record: parsed,
    }, { onConflict: 'request_id' }), 'SAVE_BUNDLE');
  }

  async saveDecision(decision: DecisionRecord): Promise<void> {
    const parsed = asRecord(decision, DecisionSchema);
    ensure(await this.client.from('decisions').upsert({
      request_id: parsed.request_id,
      policy_id: parsed.policy_id,
      record: parsed,
    }, { onConflict: 'request_id' }), 'SAVE_DECISION');
  }

  async deleteInstitutionDecision(requestId: string): Promise<void> {
    ensure(await this.client.from('decisions').delete().eq('request_id', requestId), 'DELETE_DECISION');
  }
}

export function createSupabaseEvidenceStoreFromEnv(env: NodeJS.ProcessEnv = process.env): SupabaseEvidenceStore {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_CONFIGURATION_MISSING');
  return new SupabaseEvidenceStore(createClient(url, key) as unknown as SupabaseEvidenceClient);
}
