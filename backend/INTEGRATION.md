# Live evidence integration

For Vercel deployment, use the repository root [README](../README.md#vercel-배포). Apply `20260920141145_serverless_run_control.sql` after the migrations listed below. Runtime now uses a shared database writer lock and daily request budget; failed runs keep the lock for manual chain inspection. Vercel retains background work with `waitUntil`, uses `KEY_REGISTRY_JSON`, and disables direct `/api/requests` and `/api/decisions` writes. The process-local concurrency/recovery notes below describe the earlier runtime.

The frontend now uses `/api` only. No runtime fixture fallback is provided. The local Gateway uses Supabase for persistence and the configured chain for actual signatures/anchors; the agent and institution remain MVP participants, not external financial providers. No token transfer is executed.

## Prepare

1. Create a dedicated Supabase project. Apply `supabase/migrations/001_evidence_store.sql`, `20260920084656_demo_runs.sql`, and `20260920105620_pending_evidence.sql` in order. The final migration handles JSON null decisions and prevents downgrading completed evidence. These migrations preserve signed Record schemas. Confirm RLS is enabled and anonymous clients cannot read/write evidence; only the server uses the service role key.
2. Copy `.env.example` to untracked `.env`; set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RPC_URL`, `CHAIN_ID=11155111`, `ANCHOR_CONTRACT_ADDRESS`, `KEY_REGISTRY_PATH`, and the five role private keys. Use disposable testnet keys, never deterministic test keys. The registry must match the four signing accounts. The Anchor Writer must own the deployed contract and hold test ETH.
3. Set `ENABLE_DEMOS=true` only for local demo operation. The server binds to 127.0.0.1. Do not expose this unauthenticated development runtime on the internet.
4. `npm ci`, `npm run check`, then `npm start` in backend. `npm run dev` in frontend. Vite forwards `/api` to 127.0.0.1:3000. A production host would need the same-origin proxy and authentication before exposing mutations.

Do not place private keys or the service role key in `VITE_*` variables or source control. Missing settings cause startup failure; Supabase/chain failures never select a mock fallback.

## Flow and scenarios

The minimal **테스트 요청** UI posts `{ amountBaseUnits: "3500000000" }` to `POST /api/test/requests`. This local test endpoint uses the `ENABLE_DEMOS` gate and rejects cross-site browser requests. It creates a server-signed Agent request with the exact submitted positive integer amount (at most 30 base-unit digits), then runs the existing Gateway and institution policy flow. It returns 202 with a run ID, polled through `GET /api/demo/runs/:id`. The chosen amount is stored separately in run metadata; signed Record schemas are unchanged. Above-limit requests always yield LIMIT_EXCEEDED. At or below the limit, it always yields REJECT/KYT_RISK. Direct test requests are rejection-only; no randomness or approval generation is used. Labels reflect the signed reason: 한도 초과 거절 or 알 수 없는 거절. Only REJECT bundles are returned by GET /api/cases; approval and pending evidence remain stored and retrievable by ID.

The old `POST /api/demo/runs` creation endpoint is removed; the existing GET run-status endpoint remains for test requests. The following explicit scenarios are retained as internal local-chain test fixtures, not product entry points.

| Scenario | Request / original limit | Evidence result |
| --- | --- | --- |
| normal | 4,500 / 4,000 | REJECT / LIMIT_EXCEEDED; VERIFIED |
| tampered | 3,500 / 4,000 | APPROVE retained; submitted policy copy changed to 3,000; TAMPERED |
| unknown | 3,500 / 4,000 | Signed REJECT / KYT_RISK; VERIFIED integrity, risk justification unassessed |
| missing | 3,500 / 4,000 | PROCESSING at/before chain deadline, MISSING after |

Policy tampering preserves the original bundle and anchors. The changed copy is persisted in run metadata and verified using the same verifier. The download endpoint exports the original, explicitly labelled in the UI. Deletion is explained as independent retention; no deletion demo endpoint exists.

`GET /api/cases` returns stored cases; `GET /api/cases/:id` includes evidence, checks, anchors and run stages. `POST /api/verifier` accepts `{ evidence }` and returns status/errors plus measured checks. KYT justification is `not-applicable`, not a passing amount-policy check. RPC errors are request errors, not INVALID evidence.

## Failures and recovery

`POST /api/test/requests` also accepts optional `policyTamper: true`. This requires an amount strictly below the configured original limit. The test institution signs REJECT/KYT_RISK, then run metadata stores a policy copy with `max_amount_base_units: "5000000000"`. Original evidence retains the 4,000 limit and signed rejection. The list labels this `정책 기록 변조`; real verification of the changed copy returns TAMPERED. This is a retrospective change to the policy presented for the same request, not a legitimate new policy version. The historical 4,000 → 3,000 fixture remains only in internal tests.

Apply `20260920112749_case_numbers.sql` after the migrations above. It backfills stable case numbers by original request creation time and allocates numbers for new persisted requests. Both case APIs return `displayId` (for example `REQ-001`); route IDs and signed records retain their original `request_id`. Completing or replaying an existing bundle does not allocate another number. UI numbering is independent of list ordering and filters.

One demo executes at a time per local process to avoid competing writer nonces. A failed run preserves the signed request and any already-stored evidence. A fresh process marks unfinished runs interrupted on read; it never invents completion or automatically rebroadcasts. Inspect the run and chain before retrying. Starting another scenario intentionally creates a new request ID.

Gateway recovery reuses an already mined request or decision transaction after a persistence failure. For a request without a stored receipt, it locates the original block/event using the committed timestamp and restores the receipt without rebroadcasting. A failed run preserves its signed request for resubmission; recovery never extends the deadline. Do not use multiple Gateway processes against the same writer in this MVP.

Sepolia can miss the fixed 30-second deadline. Do not extend or fake it. A reverted/late decision must remain a failed run; its request-only evidence can independently verify MISSING. Restarting the API must retain cases because production runtime storage is Supabase.

## Verification

`npm run check` covers existing unit/chain tests and the HTTP-to-local-chain four-scenario integration test, exact deadline equality, original export/reverification, duplicate request behavior and interrupted run reads. `npm test` and `npm run build` in frontend cover the HTTP boundary and UI build. Live Supabase restart checks and Sepolia scenario execution require the project/credentials above; local-chain success alone is not a live deployment claim.

For explicit disposable browser testing only, run `npx hardhat run scripts/local-preview.ts` in backend instead of `npm start`. It uses real signatures and a real local EVM contract with in-memory storage; the UI identifies chain 31337 as not Sepolia. Stop this process before starting the configured Supabase/Sepolia server on port 3000.
