# Off-Chase backend MVP

This branch follows `AGENTS/DEVELOPMENT_FINAL.md` from the current remote `main`. The Python POC on `backend-poc-python` is separate from this implementation.

Implemented: strict transport records matching the frontend's Evidence Bundle schema; canonical JSON → Keccak record hashes; EVM raw-hash signatures; mock enterprise, agent and institution roles; a gateway-signed receipt; an Ownable request/decision anchor with a 30-second chain deadline; a mandatory Gateway service for request/decision processing and idempotency; a read-only verifier that checks signatures, policy, links, anchor state and actual transaction events. The verifier requires only a Bundle, static public key registry and blockchain reader.

Run checks with Node.js 24.13 or newer:

```bash
cd backend
npm ci
npm run check
```

The local Hardhat tests exercise the chain contract, normal `REJECT / LIMIT_EXCEEDED`, altered decision, absent decision before and after deadline, unknown keys and wrong transaction references. Test keys are deterministic fixtures and must never be used on Sepolia.

The independent CLI reads an exported Bundle and a separate public key registry. Copy `key-registry.example.json` to `key-registry.json` and replace every address with the deployed role address. Export `RPC_URL`, `CHAIN_ID`, and `ANCHOR_CONTRACT_ADDRESS`; then run `npm run verify -- evidence-bundle-REQ-001.json`. The example addresses belong only to deterministic local tests. The CLI rejects a mismatched RPC chain ID and does not require private keys or Institution DB access.

Sepolia configuration uses the environment variable names in `.env.example`. With a funded Anchor Writer key and RPC URL, deployment is:

```bash
cd backend
npx hardhat run scripts/deploy-anchor.ts --build-profile production --network sepolia
```

The deploy script checks chain ID `11155111` and the contract owner. It has not yet been run on Sepolia. Gateway tests use a temporary in-memory implementation of the `EvidenceStore` port; Express routes, backend runtime key loading, demo endpoints and frontend API adapter are pending. No runtime credentials or private keys are committed.

## Supabase Evidence Store

The `SupabaseEvidenceStore` adapter implements the existing `EvidenceStore` port without changing the Gateway or verifier. Apply `supabase/migrations/001_evidence_store.sql` to a Supabase project, then configure the server-side variables in `.env.example`:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-me
```

Use `createSupabaseEvidenceStoreFromEnv()` from backend runtime wiring when that wiring is added. The service role key is required for server writes; never expose it to the frontend. Signed records and the evidence bundle are stored as JSONB, while request IDs remain unique relational keys. Deleting a row from `decisions` is intentionally independent from the already exported bundle.

`persist_evidence_bundle` is a `security definer` transaction used by `saveCompletedBundle()`. It writes the decision, anchor metadata, and completed bundle together, rejects replacement of a signed policy/request/receipt/decision with a different record, and advances an existing request from pending to complete. `GatewayService` uses this operation when available and can recover a committed decision anchor by locating its `DecisionAnchored` event before retrying persistence. `listBundles()` is available for the later case-list API and is not part of the Gateway port.
