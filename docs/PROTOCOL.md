# TRUST404 proof format v1

## Canonical encoding

All signed objects use UTF-8 JSON with object keys sorted, no insignificant whitespace, `ensure_ascii=False`, and `allow_nan=False` as implemented by `trust404.crypto.canonical_bytes`. Values are restricted to strings, integers, booleans, null, arrays, and objects with string keys. Floating-point values are rejected. JSON files are read with duplicate-key rejection. Interoperable implementations must reproduce these bytes exactly; the MVP does not claim RFC 8785 conformance.

Signatures are Ed25519 over the canonical bytes. Keys and signatures are standard Base64 of raw 32-byte public/private keys and 64-byte signatures. Hashes are lowercase hexadecimal SHA-256.

## Request and policy

The agent signs the complete request object: `request_id`, `agent_key`, `enterprise_key`, `amount_minor`, `currency`, `destination`. The enterprise signs the complete policy object: `version`, `max_amount_minor`, `currency`. The agent's request binds the enterprise public key. Key-to-organization ownership must be established separately.

The MVP policy rejects a mismatched currency with `CURRENCY_NOT_ALLOWED`, then an amount above the limit with `AMOUNT_LIMIT`; otherwise it approves with `POLICY_PASSED`. The verifier recomputes this result.

## Log entries

The first entry has sequence 1 and `prev_hash` of 64 zeroes. Each later entry points to the previous `entry_hash`.

```json
{
  "seq": 1,
  "kind": "ACCEPT",
  "body": {"request": {}, "agent_signature": "..."},
  "prev_hash": "0000...",
  "signature": "...",
  "entry_hash": "..."
}
```

The issuer signs `{seq, kind, body, prev_hash}`. `entry_hash` is SHA-256 of that object plus `signature`. A `DECISION` body has `request_id`, `accept_hash`, `policy`, `policy_hash`, `policy_signature`, `result`, and `reason`. `accept_hash` equals the corresponding acceptance entry hash. `policy_hash` is SHA-256 of the policy object.

The issuer signs a checkpoint `{size, head_hash}`; the checkpoint object adds `signature`. The external pin is SHA-256 of the complete signed checkpoint. A `proof.json` contains `{format: "trust404-proof-v1", entries: [...], checkpoint: {...}}`. Every entry up to the checkpoint is included, so proof size and verification work grow linearly with log size.

## Witness receipt

A witness first checks the issuer's full proof and whether it extends the last checkpoint already recorded for that issuer. It then signs `witness_seq`, `issuer_key`, `checkpoint_hash`, `size`, `head_hash`, `previous_receipt_hash`, and `issued_at`. `receipt_hash` is SHA-256 of those fields plus `signature`. A repeated identical checkpoint returns the previous receipt. The witness may attest a snapshot with an accepted request that has no decision; the verifier reports that fact separately.

A witness receipt only carries its own signature and local append-only history. A malicious witness could equivocate unless its receipts or log are independently published and compared. A witness under the payment operator's control is not an independent anchor.

## What verification checks

The offline verifier checks the trusted issuer key, checkpoint signature and externally supplied pin or trusted witness receipt, contiguous sequence, hash chain, entry hashes and issuer signatures, agent signatures, enterprise policy signatures, policy hashes, recomputed decisions, one acceptance and at most one decision per request, and any separately held acceptance receipts supplied by the auditor. When trusted agent or enterprise public keys are supplied separately, it also requires every accepted request to use a key from those sets.

It reports `MISSING_DECISION` for accepted requests without a decision in the checkpoint snapshot and `ACCEPTANCE_OMITTED` when a separately held signed acceptance receipt is absent from the presented log. Neither finding alone establishes a missed service deadline or proves a request that was never acknowledged.
