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

The deploy script checks chain ID `11155111` and the contract owner. It has not yet been run on Sepolia. Gateway tests use a temporary in-memory implementation of the `EvidenceStore` port; the Supabase repository, Express routes, backend runtime key loading, demo endpoints and frontend API adapter are pending. No runtime credentials or private keys are committed.

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
