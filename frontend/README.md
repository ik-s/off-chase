# Off-Chase Frontend

React + Vite + TypeScript, ordinary CSS, React hooks and Zod. Node 24.13+ is required for the TypeScript test runner.

## Run

Start the configured backend on port 3000, then run these commands from `frontend/`:

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite proxies `/api` to `http://127.0.0.1:3000`. The app injects `createHttpRepository()`; API failures never fall back to mock data. See [backend setup](../backend/INTEGRATION.md) for Supabase migrations and server-only credentials.

## Case review

Header → **테스트 요청 +** opens a single amount field and send button. The browser converts USDC to exact base units; the server signs an Agent request and lets the configured MVP institution evaluate the policy. Processing stages remain visible during polling, and **요청·응답 비교하기** opens the resulting case. No scenario selector or browser signing keys are involved. Requests require the local backend's `ENABLE_DEMOS=true` flag and consume test ETH for anchoring, not USDC.

The introduction leads to explicit case selection, then Request → Decision → Evidence. No case is automatically selected. Case numbers such as `REQ-001` are persisted database metadata, stable across filters and reloads. The signed original request ID remains unchanged and is available in technical details and exported JSON. The list remains newest-first.

The evidence screen compares the Agent request, applied policy and institution response. Three expandable sections expose actual verification checks. Long IDs, addresses, signatures and hashes are shortened visually; copy buttons copy the full original value. If clipboard access fails, a selectable full-value field appears. Sepolia request/response transactions and the contract are linked directly. Raw JSON remains collapsed by default.

Request processing stages show server observation times; anchor details show block times. PROCESSING is based on chain time, not the browser clock. Demo controls and scenario navigation are removed from the product UI; the old scenario creation endpoint is removed. Scenario fixtures remain available to local-chain tests only.

## Data boundaries

The optional **한도 미만 요청 거절 + 정책 변경** checkbox runs a 4,000 → 5,000 USDC policy-copy tampering case. It requires a request below 4,000 USDC: the institution signs REJECT/KYT_RISK despite satisfying the amount limit, then presents a changed policy copy. Original policy, request, rejection and anchors remain intact. The original bundle verifies; the changed copy is TAMPERED. The larger policy limit does not justify the rejection.

- Components use `EvidenceRepository`; credentials, signing and RPC access remain server-side.
- Record schemas mirror DEVELOPMENT. Display metadata is separate from signed records.
- Amounts remain base-unit integer strings and are formatted with BigInt.
- No USDC is transferred by this review flow. On-chain anchoring uses test ETH gas.
- VERIFIED means evidence integrity, not approval or proof that KYT risk was justified.
- Downloads preserve the original Evidence Bundle, including original IDs and signatures. Policy-tampering cases explicitly label the original download.
- JSON uploads (up to 2 MB) are sent to the real verifier. Transport errors are not INVALID evidence.
- Legacy mock adapters and fixtures remain for isolated tests and are not injected in the running app.

## Verification

`npm test` checks amount precision, repository contracts, input handling, selection state and legacy fixture logic. `npm run build` includes strict type checking. Backend tests cover real local-chain signatures, anchoring, four scenarios and stable case numbering.

Browser verification covers explicit selection, guided steps, actual evidence re-verification, short case labels, disclosure alignment, clipboard feedback, Explorer links and removal of demo navigation.

The case list contains only REJECT records. Direct test requests always generate rejection cases: above the policy limit → LIMIT_EXCEEDED; at or below the limit → KYT_RISK. There is no random approval branch. KYT_RISK is a test scenario, not a risk assessment. Labels reflect the signed reason. General record schemas still accept APPROVE for verification compatibility.
