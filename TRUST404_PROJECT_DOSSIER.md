# TRUST404 Project Dossier - Award-Potential Assessment

> Historical assessment from 15 September 2026. The backend MVP was added on 18 September 2026; see [README.md](README.md) for the current implementation and its limitations.

**Status:** 15 September 2026  
**Stage:** Concept and business-plan level; no implementation or repository was found in the current project folder.

## Executive Summary

This project is a security and accountability layer for AI-agent payments. It records the off-chain approval or rejection decisions made before a digital-asset payment is executed, then lets a user, agent operator, auditor, or counterparty independently verify that the decision was authentic and has not been modified, deleted, or omitted later.

The recommended scope is not a generic AI-payment application:

> When an enterprise AI agent requests a digital-asset payment, the wallet or policy service issues verifiable evidence of its pre-execution approval or rejection decision, including the applied policy version, and an independent verifier can detect later modification, deletion, or a missing decision after an accepted request.

This is a strong fit for TRUST404 Track 3, Verifiable Off-chain Decisions. The official track explicitly asks for a prototype that creates trustworthy records for rejected requests, supports third-party verification without the institution's server or database, and demonstrates detection of tampering, deletion, and omission. [Track requirements](https://trust404.co.kr/tracks)

## The Problem

AI-agent payments introduce several parties into one transaction: the enterprise or user, AI agent, wallet or policy engine, payment processor, merchant, and possibly a settlement network. Before the blockchain transaction exists, a wallet or security service may approve, hold, or reject the request because of spending limits, address risk, budget exhaustion, policy restrictions, anomaly detection, or required human review.

Today, the decisive event often exists only in the operator's internal database. In a dispute, an operator can say that the transaction was rejected for policy reasons, but an outside party cannot independently prove:

- What request was received.
- Which policy and exact policy version were used.
- Why the decision was made.
- Whether the decision record was changed after the fact.
- Whether an inconvenient rejection record was deleted.
- Whether a request was accepted but never given a recorded decision.

This is not primarily a payment-prevention product. It is an evidence and accountability product for decisions made before execution.

## Why the Domain Matters

Agentic payments are becoming real infrastructure, not just a speculative use case. Google AP2 uses signed mandates as proof of a user's instructions; Mastercard is actively building machine-speed agent-payment infrastructure; and x402 supports programmatic payments for APIs and autonomous agents. [Google AP2](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol) [Mastercard Agent Pay for Machines](https://www.mastercard.com/us/en/news-and-trends/press/2026/june/mastercard-launches-agent-pay-for-machines.html) [x402](https://docs.x402.org/introduction)

The project should not claim that it prevents every bad payment, phishing attempt, incorrect recipient, or agent hallucination. Those require enforceable policy controls. The project's claim is narrower and defensible: it makes the policy decision and its evidence independently auditable after the fact.

## Product Concept

**Working description:** Verifiable Decision Log for Agent Payments.

**Actors:**

- Enterprise or user: defines spending and risk policy.
- AI agent: submits a payment request.
- Wallet or policy engine: approves or rejects before execution.
- Settlement layer: executes only approved payments.
- Independent verifier: validates evidence without querying the operator database.

**Core flow:**

1. The agent submits a signed payment request.
2. The service immediately creates a signed request-acceptance record before making a decision.
3. The policy engine evaluates the request against a versioned, hashed policy.
4. The service issues a signed Decision Receipt: `APPROVED` or `REJECTED`.
5. Request and decision records enter an append-only, ordered log.
6. A batch commitment, such as a Merkle root plus log size, is anchored on a testnet or another independent timestamping layer.
7. The user or auditor receives a portable `proof.json`.
8. An independent verifier checks signatures, request-policy-decision binding, log inclusion, consistency, and the blockchain anchor.

## Evidence Package

A portable proof should contain:

- Payment request or request hash.
- Agent signature and public-key identity.
- Request-acceptance receipt.
- Enterprise policy version and policy hash.
- Decision result, reason code, timestamp, and issuer identity.
- Wallet or policy-engine signature.
- Sequence number and previous-record hash or Merkle inclusion proof.
- Signed checkpoint metadata, including tree size.
- Blockchain-anchor reference.
- The material needed to verify everything offline or without the operator's live database.

The strongest technical insight is the two-stage record:

1. Request accepted into the log.
2. Decision linked to that request.

A signed decision receipt alone can show that a decision is real, but it cannot show that the operator omitted a decision that should have existed. A request-acceptance record makes `request accepted, decision missing` detectable.

**Important honesty boundary:** The system can detect missing decisions for requests that have a signed acceptance receipt or other independently committed evidence. It cannot prove that an operator received a request it never acknowledged or committed. This limitation should be stated clearly in the threat model; doing so improves credibility.

## Security Model and Demonstrations

**Primary adversary:** The wallet, policy-service, or institution operator after a dispute arises.

**Required attack demonstrations:**

1. **Modify a rejection reason or risk score.**  
   Expected result: record hash or signature verification fails.
2. **Replace the policy version or alter a policy threshold after the decision.**  
   Expected result: policy hash no longer matches the receipt-bound policy.
3. **Delete a decision record after it was logged.**  
   Expected result: hash-chain or Merkle consistency or anchored checkpoint verification fails.
4. **Accept Request #53 but omit its decision record.**  
   Expected result: `MISSING DECISION DETECTED` because the signed request receipt has no corresponding decision within the committed log.

**Secondary non-repudiation demonstrations:**

- The agent cannot credibly deny a request it signed.
- The institution cannot credibly deny a decision it signed.
- The enterprise cannot credibly deny the policy version it committed.

## Differentiation

The central differentiation must be precise:

> AP2 proves the authenticity of an individual payment mandate or receipt. This project adds an append-only, independently anchored decision log that can reveal whether accepted requests or decision records were later modified, deleted, or omitted.

Do not position this as a replacement for AP2, x402, or institutional policy engines. Position it as an auditability layer that plugs into them.

- **AP2:** Signed user intent and signed mandate receipts; this project adds decision-log completeness and post-event consistency verification. [AP2 documentation](https://ap2-protocol.org/ap2/agent_authorization/)
- **x402:** Verifies a payment payload before resource delivery, but its normal `402 Payment Required` response is payment instruction, not automatically a security rejection. This project covers the surrounding policy-decision trail. [x402 payment flow](https://github.com/x402-foundation/x402)
- **Existing wallet-control products:** May already enforce rules and keep internal audit logs. This project's value is that those logs become independently verifiable rather than operator-controlled evidence.

## MVP Boundaries

Build only the security-critical flow:

```text
Mock enterprise agent
  -> signed payment request
  -> mock policy engine
  -> reject or approve
  -> signed Decision Receipt
  -> append-only decision log
  -> testnet anchor
  -> independent verifier
```

Do not spend the hackathon on:

- A shopping product.
- A real LLM that decides whether to buy.
- Wallet onboarding.
- Production KYC or KYT.
- Real customer funds.
- Merchant integrations.
- Polished but shallow UI.

A compact web interface plus a CLI verifier is ideal. The verifier should output clear results such as:

```text
Request signature valid
Policy hash valid
Decision signature valid
Record included in checkpoint
Blockchain anchor matches
MISSING DECISION DETECTED
VERIFIED
```

## Evaluation Against TRUST404

TRUST404 scores: problem definition 25%, security validity 25%, working implementation 20%, validation 15%, originality and impact 10%, and scalability 5%. [Official rules](https://trust404.co.kr/rules)

| Category | Estimate | Rationale |
| --- | ---: | --- |
| Track fit | 9/10 | Directly solves the exact Track 3 problem. |
| Problem clarity | 8/10 | Rejected off-chain decisions leave no public trace. |
| Security depth | 8/10 | Strong if the threat model and completeness boundary are explicit. |
| Technical originality | 7/10 | Signed receipts alone are not novel; request-first logging plus omission detection is. |
| Market credibility | 6/10 | Agentic payments are early, but major protocols and payment companies make the direction credible. |
| Demo potential | 9/10 | Tampering, policy substitution, deletion, and missing-decision attacks are visually compelling. |
| Execution certainty today | 3/10 | The current material is a plan; no working implementation was found. |

- **Overall award potential today:** 6.5/10.
- **Potential after a clean, reproducible security demo:** 8.5/10.

## Priority Recommendation

This should be treated as a **high-upside, high-execution-risk** project.

Prioritize it above another hackathon project only if the team can complete the cryptographic core and four attack demonstrations before submission. TRUST404 is especially favorable because the proposal is unusually aligned with the official track and provides a concrete, judge-friendly security demo.

Do not prioritize it over a more complete competing project if the team cannot rapidly build:

- Signed request and decision receipts.
- A versioned policy commitment.
- Append-only log plus checkpointing.
- A testnet anchor.
- An independent verifier.
- The four attack cases.

The biggest award-winning opportunity is not that AI agents can pay. It is proving that an operator cannot quietly rewrite the history of an AI agent's rejected or approved payment decisions.

## Immediate Build Priorities

1. Define the exact threat model and security guarantees.
2. Select one completeness mechanism: ordered request IDs plus hash chain or Merkle tree plus anchored tree-size checkpoints.
3. Define the canonical receipt schema and exactly what is hashed and signed.
4. Implement `proof.json` generation and an independent verifier before building UI.
5. Implement the four attacks as automated test fixtures.
6. Measure verification time, anchor cost, and detection rate across at least 100 to 1,000 records.
7. Create a five-minute demo: normal verification, reason tampering, policy tampering, deletion, and missing decision.
8. Publish a reproducible public repository, README, pitch-deck PDF, and demo video.

## Submission Facts

TRUST404 submission closes on **20 September 2026 at 23:59**. Required materials are a pitch-deck PDF, a working demo video recommended at five minutes or less, and a public GitHub or GitLab repository with run instructions. Top 6 teams advance to final presentations; at least one team member must attend the on-site demo day to be eligible for an award. [Submission requirements](https://trust404.co.kr/submit) [Schedule](https://trust404.co.kr/schedule)

## One-Sentence Pitch

A verifiable decision log for enterprise AI-agent payments that binds a signed payment request, the exact policy version, and the resulting approval or rejection into an independently verifiable, append-only, blockchain-anchored record, detecting later tampering, deletion, and missing decisions.
