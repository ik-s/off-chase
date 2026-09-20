# Off-Chase backend MVP

## Current integration runtime

The `develop` runtime now requires Supabase and provides live case/progress APIs. Setup, migration order, scenarios and recovery limitations are in [INTEGRATION.md](INTEGRATION.md). The earlier in-memory runtime notes below describe the initial implementation and are superseded by this integration guide. `npm start` never falls back to in-memory storage. `scripts/local-preview.ts` is an explicit disposable local-chain browser-test harness only.

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

## Express API runtime

`npm start` launches a development-only Gateway bound to `127.0.0.1` with the documented fixed 4,000 USDC policy and an in-memory EvidenceStore. It requires `RPC_URL`, `CHAIN_ID`, `ANCHOR_CONTRACT_ADDRESS`, `KEY_REGISTRY_PATH`, `ENTERPRISE_PRIVATE_KEY`, `AGENT_PRIVATE_KEY`, `VERIFICATION_PRIVATE_KEY`, `INSTITUTION_PRIVATE_KEY`, and `ANCHOR_WRITER_PRIVATE_KEY`. Startup confirms deployed contract code, confirms the Anchor Writer owns the contract, and verifies matching `enterprise-key-1`, `agent-key-1`, `verification-key-1`, and `institution-key-1` registry entries. The process has no persistence across restarts. Optional `PORT` defaults to `3000`.

- `POST /api/requests` with `{ "request": RequestRecord }` anchors a signed request and returns its Evidence Bundle.
- `POST /api/decisions` with `{ "decision": DecisionRecord }` anchors an institution decision and returns its completed bundle.
- `GET /api/requests/:requestId/evidence` downloads `evidence-bundle-<requestId>.json`.
- `POST /api/verifier` with `{ "evidence": EvidenceBundle }` returns the independent verifier report. It reads only the static registry and chain client, never the institution store.

Sepolia configuration uses the environment variable names in `.env.example`. With a funded Anchor Writer key and RPC URL, deployment is:

```bash
cd backend
npx hardhat run scripts/deploy-anchor.ts --build-profile production --network sepolia
```

The deploy script checks chain ID `11155111` and the contract owner. A disposable demo `DecisionAnchor` was deployed on Sepolia at [`0xd021328C42E17d16DF7DC306c326D90F7bC8f940`](https://sepolia.etherscan.io/address/0xd021328C42E17d16DF7DC306c326D90F7bC8f940). The development API uses an in-memory EvidenceStore; Supabase runtime wiring, demo endpoints and the frontend API adapter remain pending. No runtime credentials or private keys are committed.

## Supabase Evidence Store

The `SupabaseEvidenceStore` adapter implements the `EvidenceStore` port. Apply `supabase/migrations/001_evidence_store.sql` to a Supabase project, then configure the server-side variables in `.env.example`:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-me
```

Use `createSupabaseEvidenceStoreFromEnv()` from backend runtime wiring when that wiring is added. The service role key is required for server writes; never expose it to the frontend. Signed records and the evidence bundle are stored as JSONB, while request IDs remain unique relational keys. Deleting a row from `decisions` is intentionally independent from the already exported bundle.

`persist_evidence_bundle` is a `security definer` transaction used by `saveCompletedBundle()`. It writes the decision, anchor metadata, and completed bundle together, rejects replacement of a signed policy/request/receipt/decision with a different record, and advances an existing request from pending to complete. `GatewayService` uses this operation when available and can recover a committed decision anchor by locating its `DecisionAnchored` event before retrying persistence. `listBundles()` is available for the later case-list API and is not part of the Gateway port.


For an isolated **real testnet USDC transfer** check, fund a disposable Sepolia wallet with test ETH for gas and at least 1 test USDC. The script uses [Circle's Sepolia test USDC contract](https://developers.circle.com/stablecoins/usdc-contract-addresses), sends 1 USDC to a separate test address, and checks the mined receipt's exact `Transfer` event and both balance changes. Keep the wallet JSON outside Git; it needs `{"chainId":11155111,"address":"0xYourWalletAddress","privateKey":"0x..."}`. Run:

```bash
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
SMOKE_WALLET_PATH=/absolute/path/to/test-wallet.json \
SMOKE_RECIPIENT=0xYourOtherTestAddress \
npm run smoke:usdc
```

The transfer amount is fixed at 1 test USDC. Before broadcast, the script creates a one-use intent file next to the wallet JSON and refuses to send again while that file exists. It records the broadcast transaction hash before waiting for a receipt. If receipt or balance verification fails after broadcast, resume without signing another transaction:

```bash
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
SMOKE_INTENT_PATH=/absolute/path/to/test-wallet.json.usdc-smoke-intent.json \
npm run smoke:usdc -- --verify
```

If the intent remains `PENDING` without a hash after an interrupted broadcast, inspect the sender's nonce and transactions on Sepolia before any manual retry. The script refuses a wrong chain ID, missing gas or USDC, a failed simulation, an unrelated event, and unexpected balance changes. Its result is a token transfer check, separate from the DecisionAnchor evidence proof; the MVP contract does not settle payments.

To test the approved **rejection evidence flow on Sepolia**, first deploy `DecisionAnchor` using the funded Anchor Writer and the deployment command above. Then run the gateway against that contract, using a new empty output directory:

```bash
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
SMOKE_WALLET_PATH=/absolute/path/to/test-wallet.json \
ANCHOR_CONTRACT_ADDRESS=0xYourDeployedDecisionAnchor \
SMOKE_RECIPIENT=0xYourOtherTestAddress \
SMOKE_EVIDENCE_DIR=/absolute/path/to/new-evidence-output \
npm run smoke:evidence
```

The script checks chain ID, deployed contract owner and gas balance before writing to the chain. It signs a 4,500 USDC request against a 4,000 USDC policy, anchors the request and `REJECT / LIMIT_EXCEEDED` decision, writes the Evidence Bundle and public key registry, and verifies those files with a separate read-only chain client. The evidence run itself never transfers USDC. If the network misses the contract's 30-second decision window, the request-only bundle remains on disk for later independent `MISSING` verification. The smoke run creates its own role keys and registry; a third party must obtain the trusted role addresses independently before treating the signatures as authenticated identities.

On 2026-09-20, the Sepolia smoke run produced a [request anchor](https://sepolia.etherscan.io/tx/0xc6cee1181e930bcf85be259a4f8a7cfe6b61df9e4a049abb3b9ff244e7f8f973) and [decision anchor](https://sepolia.etherscan.io/tx/0xefb77b9202480b04e8a8c29fd6e6054651e5e1fed9b2e5811ded0db7869efe94). The exported Bundle verified as `VERIFIED` using the separate CLI. An earlier request's [decision transaction](https://sepolia.etherscan.io/tx/0x694655dd4836f591aacd0be4e7237fe473e6a67b60024703d374e06bc7ad6a3b) reverted because its block arrived 36 seconds after the request anchor; its saved request-only Bundle verified as `MISSING`. The [isolated 1 test USDC transfer](https://sepolia.etherscan.io/tx/0x416dd77e223d28d62bd40d7a35b079480059d285371df86f8a6835a597f1432e) also succeeded. These tests do not establish payment settlement by the Anchor contract.

The public signed Bundle and demo role-address registry are in `examples/sepolia-verified/`. To repeat read-only verification against Sepolia without Institution storage or any signing key:

```bash
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
CHAIN_ID=11155111 \
ANCHOR_CONTRACT_ADDRESS=0xd021328C42E17d16DF7DC306c326D90F7bC8f940 \
KEY_REGISTRY_PATH=examples/sepolia-verified/key-registry.json \
npm run verify -- examples/sepolia-verified/evidence-bundle.json
```

The registry identifies this demo's mock roles because the project publishes it separately from the Bundle. It does not establish real-world enterprise or institution identity.
