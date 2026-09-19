# Frontend implementation verification

## Implemented

Latest UI revision: shared audit workspace with persistent Header/Case List, direct Request/Decision/Evidence views, data-first summary, visible chronological record flow and adjacent Inspector. Home retains the requested headline with one sentence; technical values remain collapsed. Earlier guided/landing checks below document superseded layouts.

- Isolated React + Vite + TypeScript app in `frontend/`, using ordinary CSS, React hooks and Zod only.
- Off-Chase introduction → explicit request selection → guided request → decision → evidence flow, separate payment and evidence statuses, deferred five-step Timeline and record-specific technical details. No request is selected automatically.
- Async, injected repository port with session-local Mock implementation; no Backend, Smart Contract, cryptographic verification, RPC or database logic.
- All five verification statuses, four independent demo scenarios, Evidence JSON download, upload validation and exact-fixture simulated verification.
- Loading/error/empty states, stale response protection, keyboard focus and narrow layout support.

## Automated checks

- `npm run build`: passed, including strict TypeScript checks.
- `npm test`: 14 passed, 0 failed.
- Policy, Request, Verification Receipt and Decision fixture field names programmatically compared against DEVELOPMENT_FINAL.md examples: all match.
- Existing tracked documents remain unchanged; all implementation changes are under `frontend/`.

Tests cover amount precision, Bundle fields, fixture upload/download round trips, unknown and invalid input, five statuses, deadline equality/boundary behavior, tamper comparison, retained evidence after institution deletion, session/mutation isolation, filter transitions, stale response rejection and an alternate repository implementation.

## Initial browser checks (before the guided UX revision)

Verified in the Codex in-app browser:

- 1440px desktop: default request amount, policy limit, REJECT/LIMIT_EXCEEDED and VERIFIED are present; Decision detail selected; no horizontal document overflow; technical disclosures initially closed.
- All five timeline records change the evidence panel.
- On-chain disclosure exposes clearly labelled sample addresses and transactions.
- Status filters select matching cases; an expired PROCESSING filter shows an empty state.
- Tampered state shows LIMIT_EXCEEDED → KYT_RISK and failure reasons.
- Missing demo visibly transitions PROCESSING → MISSING after the simulated deadline.
- Deleted institution record case retains Decision evidence and VERIFIED with the correct explanation.
- Normal fixture upload produces a simulated VERIFIED result; modified valid fixture is unsupported; malformed JSON shows a file error.
- 390px viewport: no horizontal document overflow.
- Keyboard Tab reaches controls with a visible focus outline; Enter expands Raw JSON.
- Final default screen: no captured console errors or warnings.

## Guided UX revision checks (before the Off-Chase landing revision)

The revised interface was checked in the in-app browser after the user's request for a step-by-step experience:

- First screen shows the request and policy comparison with one primary next action. Case list, Timeline, Record detail, demo controls and download actions are not displayed on entry.
- Later steps are disabled until reached; request → decision → explicit verification progresses correctly and moves keyboard focus to the current heading.
- VERIFIED and TAMPERED results appear after verification; technical Timeline and Record detail are available only when requested.
- Opening the case picker, filtering, and returning preserves the current case and completed step. Explicitly selecting another case starts at request review.
- Known-file upload verifies successfully in its own view with detailed checks collapsed.
- Missing demo begins at request review, initially verifies as PROCESSING, and returns MISSING when rechecked after the deadline.
- Deleted DB demo explains retained evidence and returns VERIFIED.
- Desktop first screen inspected at 1440px. The verification screen has no horizontal overflow at 390px. No console warnings or errors captured during the walkthrough.
- Strict TypeScript/production build and all 14 existing regression tests pass. No libraries or Backend/Crypto features were added.

## Off-Chase landing and typography revision

- Header, document title and favicon use Off-Chase, with an original SVG mark representing an open orbit and evidence trail.
- Entry shows the service introduction and a request-selection CTA. The picker initially has zero selected requests; loading and filtering never select the first item automatically.
- Explicitly selecting REQ-002 opens its request stage; decision and simulated TAMPERED verification progress correctly. The brand button returns to the introduction.
- Main explanatory text computes to 20px; primary actions and supporting information use the enlarged responsive type scale.
- Desktop picker and 390px introduction, picker and verification result have no horizontal document overflow.
- Strict TypeScript/production build and all 14 tests pass, including updated assertions for explicit selection.

## Audit workspace revision checks

- Production build with strict TypeScript and all 14 existing tests pass; records, repository and business logic remain unchanged.
- At 1440px, Case List, selected case and Inspector remain within the shared shell. Request amount, decision, policy and verification precede the Timeline.
- Explicit Request/Decision/Evidence selection has no sequential gating; REJECT and VERIFIED remain independent.
- TAMPERED filtering clears an incompatible selection; selecting REQ-002 shows LIMIT_EXCEEDED → KYT_RISK and failed checks.
- Policy and Verification Receipt selections update the Inspector. Hash/signature, on-chain values and Raw JSON start collapsed; keyboard Enter expands Raw JSON.
- File Verifier retains the Case List and focuses its visible heading. Browser logs contain a Vite development WebSocket connection failure; tested application interactions completed successfully.
- At 390px, the evidence view has no horizontal overflow. Temporary viewport overrides were reset.

## Download verification limitation

The download button triggers the Blob download path and displays the requested filename, but the in-app browser's download event timed out and no saved file was confirmed. Actual browser file-save completion and uploading that exact saved file remain unverified. Repository-level download content and round-trip verification pass, and the equivalent checked-in normal fixture was uploaded successfully through the UI. Confirm file-save completion in a normal browser before a live demo.

This app deliberately does not verify real signatures or on-chain evidence. Actual API integration depends on the still-undefined Case list/detail and demo endpoints and detailed Verifier response contract; see README.md.
