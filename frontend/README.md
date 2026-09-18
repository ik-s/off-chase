# Off-Chase Frontend

React + Vite + TypeScript, ordinary CSS, React hooks, and Zod. Node 24.13+ is required for the dependency-free TypeScript test runner.

## Run

From `frontend/`:

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

The app opens on an Off-Chase service introduction. Select “요청 선택하고 시작하기”, then explicitly choose a request. No case is selected or loaded automatically. `REQ-001` is one available example: 4,500 USDC → 4,000 USDC limit → REJECT / LIMIT_EXCEEDED → VERIFIED.

## Guided experience

The interface follows service introduction → request picker → the progressive review below. The Off-Chase logo in the header returns to the introduction; the same original SVG is used as the favicon. Body text and primary actions are approximately 20px, with 14–16px supporting text and responsive adjustments.

1. **요청 확인**: compare the request amount and policy limit; one primary action opens the institution's decision.
2. **판단 이해**: read the recorded decision and reason; explicitly start evidence verification.
3. **증거 검증**: see the returned status and four human-readable groups of checks. Full checks, Timeline, Record details, hashes and JSON are optional disclosures.

Downloads and additional scenarios appear after verification. Case selection and file verification have separate focused views. Opening and returning from a secondary view preserves progress; choosing a different case or creating a new demo starts at step 1. Filtering the case picker does not select a case until the user clicks one. Later steps unlock as the user progresses, and keyboard focus follows the current heading.

`GuidedCase.tsx` owns presentation-only step state. Verification still goes through `useWorkspace` and the injected repository. A PROCESSING result is explicitly a verification-time snapshot; use “검증 결과 다시 확인” after the simulated deadline to retrieve the updated result.

## Boundaries

- This is a **Frontend mock demo**, not a cryptographic verifier. Signatures, hashes, transactions and contract addresses are non-cryptographic placeholders. No private keys, Backend, database, wallet, RPC, or Smart Contract implementation is included.
- `src/data/records.ts` mirrors the four DEVELOPMENT records and Evidence Bundle. UI metadata is kept separately in `src/data/types.ts`.
- Amounts stay in base-unit integer strings. Formatting uses BigInt without floating-point conversion.
- All component data comes through `EvidenceRepository`, injected in `src/main.tsx`. The Mock adapter is session-local and async. Reloading resets it.
- CSS tokens and shared status components follow DESIGN.md. No UI, router, or state management library is installed.

## Demo and file behavior

The initial cases cover all five statuses. Demo Controls add independent cases for Normal, Decision Tampered, Decision Missing, and Institution DB Deleted.

Missing advances **simulated chain time** from a fixed fixture timestamp using elapsed monotonic ticks inside the Mock adapter. It starts 5 seconds after request observation; it stays PROCESSING at the 30-second deadline and becomes MISSING on the following tick (about 26 seconds after running the demo). No PC wall-clock date determines missing status. Real integration must use returned chain time/status instead.

Deleted DB cases keep the previously captured bundle and anchor metadata separate from institution record availability. They do not claim to prove a deletion action.

Download exports only the Evidence Bundle. Upload supports JSON files up to 2 MB. Zod checks shape, then the adapter recognizes exact session fixtures (ignoring object key order). Only recognized fixtures receive simulated results. Unknown, modified, or previous-session demo files require a real Verifier; they are never automatically marked VERIFIED. Invalid JSON is a file error; structurally invalid bundles produce INVALID_EVIDENCE_SCHEMA. No hash or signature verification is performed.

## Future API integration

Implement `EvidenceRepository` and replace its injection in `src/main.tsx`; do not import transport or fixtures in components.

Documented routes:

- Evidence download: `GET /api/requests/:requestId/evidence`
- Verification: `POST /api/verifier`
- Request ingress: `POST /api/requests` requires an already signed Request; Frontend must not create signatures.
- No direct UI call to `POST /api/decisions`.

Case list/detail, request-demo triggering, attack-demo endpoints, and the detailed verification response still need Backend contracts. The repository methods are **internal interfaces, not invented HTTP routes**. The eventual adapter must map API checks, errors, chain time and anchor metadata to view models. No automatic fallback to Mock is allowed.

The document does not specify the absent-decision encoding of `anchors.decision_tx`: this Frontend accepts omitted or null and its missing fixtures omit it. Confirm the final wire encoding during API integration. Record field names and other Bundle fields are unchanged.

## Verification

`npm test` covers base-unit precision, exact fixture round trips, unknown/invalid input, all statuses, deadline boundaries, retained evidence after deletion, mutation isolation, filter selection, stale responses, and the replaceable repository boundary. `npm run build` includes strict type checking.

Browser checks cover step-by-step progression, deferred tools, preserved progress, explicit Case selection, optional Timeline/technical data, demos, file upload, keyboard focus and desktop/narrow layouts. Build output is static and can be served with `npm run preview`.

Sample upload files live in `tests/fixtures/`: `normal.json` reproduces the initial VERIFIED fixture, `unknown.json` is structurally valid but unsupported, and `malformed.json` tests invalid JSON feedback.

See [VERIFICATION.md](./VERIFICATION.md) for completed checks and the in-app browser download limitation.
