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

The app opens on a compact Off-Chase introduction alongside the persistent Case List. Select a request directly; no case is selected or loaded automatically. `REQ-001` is one available example: 4,500 USDC → 4,000 USDC limit → REJECT / LIMIT_EXCEEDED → VERIFIED.

## Investigation workspace

The shared header and Case List remain present across Home, case detail, File Verifier and demos. The Off-Chase logo returns to Home. The navy palette and original SVG brand are retained; typography emphasizes amounts over headings, with monospace reserved for identifiers and technical values.

1. **Request**: amount, institution decision, applied policy and verification summary, followed by recorded timestamps.
2. **Decision**: decision and reason code, tamper comparison when available, and the decision deadline.
3. **Evidence**: current verification status, four checklist groups and an explicit re-verification action.

Views are freely accessible without sequential unlocking. The visible Request → Receipt → Decision → Evidence timeline selects the adjacent Inspector. Applied Policy opens from the summary. The timeline distinguishes Request and Decision anchor times and never invents a Decision creation timestamp. Hash, signature, transaction and Raw JSON values remain collapsed. Downloads, files and demos retain their existing repository behavior.

`GuidedCase.tsx` owns presentation-only view and evidence selection. Verification still goes through `useWorkspace` and the injected repository. Explicit re-verification results are labelled as snapshots; use “다시 검증” after a PROCESSING deadline. Filtering clears an incompatible selection without auto-selecting another request.

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

Browser checks cover persistent navigation, direct view switching, explicit Case selection, Timeline/Inspector linkage, collapsed technical data, filtering, verification and desktop/narrow layouts. Build output is static and can be served with `npm run preview`.

Sample upload files live in `tests/fixtures/`: `normal.json` reproduces the initial VERIFIED fixture, `unknown.json` is structurally valid but unsupported, and `malformed.json` tests invalid JSON feedback.

See [VERIFICATION.md](./VERIFICATION.md) for completed checks and the in-app browser download limitation.
