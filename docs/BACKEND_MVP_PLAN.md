# Backend MVP implementation plan

Source of truth: `AGENTS/PROJECT_OVERVIEW_UPDATED.md` and `AGENTS/DEVELOPMENT_FINAL.md` at `origin/main` commit `5d89e1d`. Refresh remote documents before each implementation milestone. The earlier Python POC is kept on its separate branch and is not the MVP implementation.

## Architecture

The TypeScript backend separates signed records, the mandatory verification gateway, the mock institution, chain anchoring, Supabase persistence, and an independent verifier. A request carries its policy commitment before the gateway writes a Sepolia request anchor. Only the gateway wallet can write anchors. The verifier reads the supplied bundle, a static key registry, and the chain; it never reads institution storage.

## Milestones

1. Record schemas, canonical JSON, Keccak hashes, EVM signatures, nonce and frozen golden fixtures. Test malformed records, key mismatch, signature exclusion and large integer amounts.
2. `DecisionAnchor.sol` with Ownable, one request and decision anchor per ID, 30-second chain deadline, events. Test writer access, duplicates, missing request and deadline boundaries on a local Hardhat chain.
3. Chain client, signed policy/request/receipt/decision flow and mock institution. Test the 4,500 versus 4,000 USDC rejection and policy commitments.
4. Supabase repositories and Express APIs from section 28, including idempotency and case-scoped bundle download. Keep backend signing keys in environment variables and public addresses in a static registry.
5. Independent verifier and four attack/demo paths. Test verified, tampered, processing/missing and a deleted institution row using previously exported evidence.
6. Frontend adapter contract, integration tests, deployment instructions and Sepolia smoke verification. Do not mark Sepolia complete until a live transaction and chain read have been checked.

## Current implementation

Milestone 1 and the local-chain portion of milestone 2 are implemented. The pure domain roles, signed receipt, read-only chain reader and verifier are implemented and tested on a local Hardhat chain. Sepolia deployment, Supabase persistence, Express API, CLI and frontend adapter remain. Every milestone gets a fresh comparison with the latest remote development document before implementation and a full relevant test and typecheck run before completion claims.
