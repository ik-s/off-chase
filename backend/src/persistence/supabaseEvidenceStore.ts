import { createClient } from '@supabase/supabase-js';
import type { Run } from '../api/cases.ts';
import type { EvidenceStore } from '../verification/service.ts';
import { hashRecord } from '../crypto/records.ts';
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
  rpc(functionName: string, args: Record<string, unknown>): Promise<QueryResult<unknown>>;
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

  async getCaseNumber(id: string): Promise<number | null> {
    const row = ensure(await this.client.from('requests').select('case_number').eq('request_id', id).maybeSingle<{ case_number: number }>(), 'GET_CASE_NUMBER');
    return row?.case_number ?? null;
  }

  async getPolicy(policyId: string): Promise<PolicyRecord | null> {
    const row = ensure(await this.client.from('policies').select('record').eq('policy_id', policyId).maybeSingle<JsonRow>(), 'GET_POLICY');
    return row ? asRecord(row.record, PolicySchema) : null;
  }

  async savePolicy(policy: PolicyRecord): Promise<void> {
    const existing = await this.getPolicy(policy.policy_id);
    if (existing) {
      if (hashRecord(existing, 'enterprise_signature') !== hashRecord(policy, 'enterprise_signature')) throw new Error('IMMUTABLE_POLICY_CONFLICT');
      return;
    }
    ensure(await this.client.from('policies').insert({ policy_id: policy.policy_id, record: PolicySchema.parse(policy) }), 'SAVE_POLICY');
  }

  async saveRun(run: Run): Promise<void> {
    ensure(await this.client.from('demo_runs').upsert({ id: run.id, record: run }, { onConflict: 'id' }), 'SAVE_RUN');
  }

  async getRun(id: string): Promise<Run | null> {
    const row = ensure(await this.client.from('demo_runs').select('record').eq('id', id).maybeSingle<{ record: Run }>(), 'GET_RUN');
    return row?.record ?? null;
  }

  async getBundle(requestId: string): Promise<EvidenceBundle | null> {
    const row = ensure(await this.client.from('evidence_bundles').select('record').eq('request_id', requestId).maybeSingle<BundleRow>(), 'GET_BUNDLE');
    return row ? asRecord(row.record, EvidenceBundleSchema) : null;
  }

  async listBundles(): Promise<EvidenceBundle[]> {
    const query = this.client.from('evidence_bundles').select('record');
    const result = await (query as unknown as Promise<QueryResult<JsonRow[]>>);
    return ensure(result, 'LIST_BUNDLES').map((row) => asRecord(row.record, EvidenceBundleSchema));
  }

  async saveBundle(bundle: EvidenceBundle): Promise<void> {
    const parsed = EvidenceBundleSchema.parse(bundle);
    ensure(await this.client.rpc('persist_evidence_bundle', { p_bundle: parsed }), 'SAVE_BUNDLE');
  }

  async saveCompletedBundle(bundle: EvidenceBundle): Promise<void> {
    await this.saveBundle(bundle);
  }

  async saveDecision(decision: DecisionRecord): Promise<void> {
    const parsed = asRecord(decision, DecisionSchema);
    const existing = ensure(await this.client.from('decisions').select('record').eq('request_id', parsed.request_id).maybeSingle<JsonRow>(), 'GET_DECISION');
    if (existing) {
      const previous = asRecord(existing.record, DecisionSchema);
      if (hashRecord(previous, 'institution_signature') !== hashRecord(parsed, 'institution_signature')) {
        throw new Error('IMMUTABLE_DECISION_CONFLICT');
      }
      return;
    }
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
