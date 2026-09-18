import { z } from 'zod';

// Transport records mirror DEVELOPMENT_FINAL.md. UI metadata stays outside them.
const version = z.literal(1);
const id = z.string().min(1);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const signature = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
const amount = z.string().regex(/^(0|[1-9]\d*)$/);
const timestamp = z.number().int().nonnegative().safe();

export const PolicySchema = z.strictObject({
  schema_version: version, policy_id: id, version: z.number().int().positive(),
  asset: z.literal('USDC'), max_amount_base_units: amount,
  valid_from: z.iso.datetime(), enterprise_key_id: id, enterprise_signature: signature,
});
export const RequestSchema = z.strictObject({
  schema_version: version, request_id: id, created_at: z.iso.datetime(),
  asset: z.literal('USDC'), amount_base_units: amount, recipient: address,
  policy_id: id, policy_hash: hash, nonce: hash,
  agent_key_id: id, agent_signature: signature,
});
export const VerificationReceiptSchema = z.strictObject({
  schema_version: version, request_id: id, request_hash: hash, policy_hash: hash,
  request_anchor_tx: hash, request_anchor_block: z.number().int().nonnegative().safe(),
  observed_at: timestamp, decision_deadline: timestamp,
  verification_key_id: id, verification_signature: signature,
});
export const DecisionSchema = z.strictObject({
  schema_version: version, request_id: id, request_hash: hash,
  policy_id: id, policy_hash: hash, decision: z.enum(['REJECT', 'APPROVE']),
  reason_code: id, institution_key_id: id, institution_signature: signature,
});
export const EvidenceBundleSchema = z.strictObject({
  schema_version: version, policy: PolicySchema, request: RequestSchema,
  verification_receipt: VerificationReceiptSchema, decision: DecisionSchema.nullable(),
  anchors: z.strictObject({
    chain_id: z.number().int().positive(), contract_address: address,
    request_tx: hash,
    // Missing-decision bundles have no decision transaction. Its wire encoding
    // is not specified yet; accept absent/null without inventing a transaction.
    decision_tx: hash.nullish(),
  }),
});

export type PolicyRecord = z.infer<typeof PolicySchema>;
export type RequestRecord = z.infer<typeof RequestSchema>;
export type VerificationReceipt = z.infer<typeof VerificationReceiptSchema>;
export type DecisionRecord = z.infer<typeof DecisionSchema>;
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
