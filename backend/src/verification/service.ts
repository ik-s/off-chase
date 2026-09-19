import type { PrivateKeyAccount } from 'viem/accounts';
import { AnchorClient } from '../blockchain/anchorClient.ts';
import { hashRecord, verifyRecordSignature } from '../crypto/records.ts';
import { decideRequest, type KeyRegistry } from '../institution/mockWallet.ts';
import {
  DecisionSchema, EvidenceBundleSchema, RequestSchema,
  type DecisionRecord, type EvidenceBundle, type PolicyRecord,
} from '../records/schemas.ts';
import { createReceipt } from './receipt.ts';

export interface EvidenceStore {
  getPolicy(policyId: string): Promise<PolicyRecord | null>;
  getBundle(requestId: string): Promise<EvidenceBundle | null>;
  saveBundle(bundle: EvidenceBundle): Promise<void>;
  saveDecision(decision: DecisionRecord): Promise<void>;
  deleteInstitutionDecision(requestId: string): Promise<void>;
  /** Persist a decision-bearing bundle atomically when the backing store supports it. */
  saveCompletedBundle?(bundle: EvidenceBundle): Promise<void>;
}

export class GatewayService {
  private readonly anchor: AnchorClient;
  private readonly store: EvidenceStore;
  private readonly registry: KeyRegistry;
  private readonly verificationAccount: PrivateKeyAccount;
  private readonly institutionAccount: PrivateKeyAccount;

  constructor(
    anchor: AnchorClient,
    store: EvidenceStore,
    registry: KeyRegistry,
    verificationAccount: PrivateKeyAccount,
    institutionAccount: PrivateKeyAccount,
  ) {
    this.anchor = anchor;
    this.store = store;
    this.registry = registry;
    this.verificationAccount = verificationAccount;
    this.institutionAccount = institutionAccount;
  }

  async submitRequest(input: unknown, options: { omitDecision?: boolean } = {}): Promise<EvidenceBundle> {
    const request = RequestSchema.parse(input);
    const requestHash = hashRecord(request, 'agent_signature');
    const existing = await this.store.getBundle(request.request_id);
    if (existing) {
      if (hashRecord(existing.request, 'agent_signature') !== requestHash) throw new Error('REQUEST_ID_CONFLICT');
      return existing;
    }
    const policy = await this.store.getPolicy(request.policy_id);
    if (!policy || request.policy_hash !== hashRecord(policy, 'enterprise_signature') || request.asset !== policy.asset ||
        Date.parse(request.created_at) < Date.parse(policy.valid_from)) throw new Error('POLICY_MISMATCH');
    if (!this.registry[policy.enterprise_key_id] ||
        !await verifyRecordSignature(policy, 'enterprise_signature', this.registry[policy.enterprise_key_id])) {
      throw new Error('INVALID_ENTERPRISE_SIGNATURE');
    }
    if (!this.registry[request.agent_key_id] ||
        !await verifyRecordSignature(request, 'agent_signature', this.registry[request.agent_key_id])) {
      throw new Error('INVALID_AGENT_SIGNATURE');
    }
    if ((await this.anchor.readRecord(request.request_id)).requestHash) throw new Error('REQUEST_ALREADY_ANCHORED');
    const requestAnchor = await this.anchor.anchorRequest(request.request_id, requestHash, request.policy_hash as `0x${string}`);
    const receipt = await createReceipt(this.verificationAccount, request, requestAnchor);
    const bundle = EvidenceBundleSchema.parse({
      schema_version: 1, policy, request, verification_receipt: receipt, decision: null,
      anchors: {
        chain_id: this.anchor.chainId, contract_address: this.anchor.address, request_tx: requestAnchor.requestTx,
      },
    });
    await this.store.saveBundle(bundle);
    if (options.omitDecision) return bundle;
    const decision = await decideRequest(this.institutionAccount, request, policy, receipt, this.registry);
    return this.submitDecision(decision);
  }

  async submitDecision(input: unknown): Promise<EvidenceBundle> {
    const decision = DecisionSchema.parse(input);
    const bundle = await this.store.getBundle(decision.request_id);
    if (!bundle) throw new Error('UNVERIFIED_REQUEST');
    const requestHash = hashRecord(bundle.request, 'agent_signature');
    if (decision.request_hash !== requestHash || decision.policy_hash !== bundle.request.policy_hash ||
        decision.policy_id !== bundle.policy.policy_id) throw new Error('INVALID_REQUEST_REFERENCE');
    if (!this.registry[decision.institution_key_id] ||
        !await verifyRecordSignature(decision, 'institution_signature', this.registry[decision.institution_key_id])) {
      throw new Error('INVALID_INSTITUTION_SIGNATURE');
    }
    const exceeded = BigInt(bundle.request.amount_base_units) > BigInt(bundle.policy.max_amount_base_units);
    if (decision.decision !== (exceeded ? 'REJECT' : 'APPROVE') ||
        decision.reason_code !== (exceeded ? 'LIMIT_EXCEEDED' : 'WITHIN_LIMIT')) throw new Error('POLICY_MISMATCH');
    const decisionHash = hashRecord(decision, 'institution_signature');
    if (bundle.decision) {
      if (hashRecord(bundle.decision, 'institution_signature') === decisionHash) return bundle;
      throw new Error('DECISION_ALREADY_ANCHORED');
    }
    const record = await this.anchor.readRecord(decision.request_id);
    if (!record.requestHash || record.requestHash !== requestHash) throw new Error('INVALID_REQUEST_REFERENCE');
    const recovered = record.decisionHash === decisionHash;
    if (recovered && (record.decisionAnchoredAt === null || record.decisionAnchoredAt > record.decisionDeadline)) {
      throw new Error('DEADLINE_EXPIRED');
    }
    if (!recovered && await this.anchor.chainTime() > record.decisionDeadline) throw new Error('DEADLINE_EXPIRED');
    const recoveredTx = recovered && await this.anchor.findDecisionTx(
      decision.request_id,
      decisionHash,
      BigInt(bundle.verification_receipt.request_anchor_block),
    );
    const result = recoveredTx
      ? { decisionTx: recoveredTx }
      : await this.anchor.anchorDecision(decision.request_id, decisionHash);
    const completed = EvidenceBundleSchema.parse({
      ...bundle, decision, anchors: { ...bundle.anchors, decision_tx: result.decisionTx },
    });
    if (this.store.saveCompletedBundle) {
      await this.store.saveCompletedBundle(completed);
    } else {
      await this.store.saveDecision(decision);
      await this.store.saveBundle(completed);
    }
    return completed;
  }
}
