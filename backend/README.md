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

The deploy script checks chain ID `11155111` and the contract owner. It has not yet been run on Sepolia. The API runtime uses an in-memory EvidenceStore for the MVP; a Supabase repository, demo endpoints and frontend API adapter remain pending. No runtime credentials or private keys are committed.
