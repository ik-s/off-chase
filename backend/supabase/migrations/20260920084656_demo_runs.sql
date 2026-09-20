-- Runtime metadata only; no changes to signed Evidence Bundle schemas.
create table public.demo_runs (
  id text primary key,
  record jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.demo_runs enable row level security;
revoke all on public.demo_runs from anon, authenticated;
grant select, insert, update on public.demo_runs to service_role;

-- Do not depend on project-specific default grants for server-only tables.
grant select, insert, update on public.policies, public.requests,
  public.verification_receipts, public.decisions, public.anchors,
  public.evidence_bundles to service_role;
