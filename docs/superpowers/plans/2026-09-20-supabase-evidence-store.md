# Supabase Evidence Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Supabase PostgreSQL adapter for the existing `EvidenceStore` port and a migration that stores each signed record plus the evidence bundle without changing API runtime code.

**Architecture:** Keep `GatewayService` dependent on its existing port. The adapter uses `@supabase/supabase-js`, maps strict Zod records to JSONB rows, and reconstructs bundles from the bundle row. The schema keeps request IDs unique and stores signed records independently so institution decisions can be removed while exported bundles remain self-contained.

**Tech Stack:** TypeScript, Node.js, `@supabase/supabase-js`, Supabase PostgreSQL, Node test runner.

**Spec:** `AGENTS/DEVELOPMENT_FINAL.md`, sections 6.3 and 29.

## Global Constraints

- Do not add runtime credentials or private keys.
- Do not change API runtime files or the existing `EvidenceStore` port.
- Final verification authority remains signatures plus on-chain anchors.

## Review Focus

- A duplicate request ID must be rejected by the database constraint.
- A missing row must return `null` from lookup methods.
- A saved decision must be reflected in the bundle while remaining independently deletable.
- JSONB records must round-trip without coercing amounts, hashes, or signatures.

### Task 1: Supabase adapter and schema

**Files:** Create `backend/src/persistence/supabaseEvidenceStore.ts`, `backend/supabase/migrations/001_evidence_store.sql`, `backend/.env.example`; modify `backend/README.md`.

- [ ] Define the adapter against `EvidenceStore` with injectable Supabase client.
- [ ] Add typed row mapping, CRUD methods, and environment factory.
- [ ] Add migration tables, constraints, indexes, and RLS defaults.
- [ ] Document local setup and required environment variables.

### Task 2: Adapter tests

**Files:** Create `backend/tests/supabase-evidence-store.test.ts`.

- [ ] Use a fake Supabase query client to exercise save and lookup behavior.
- [ ] Verify missing lookups, bundle round-trip, and decision deletion.

### Task 3: Verification

- [ ] Run `npm run typecheck` and focused adapter tests.
- [ ] Run `npm run check` before commit and PR.
