create table if not exists public.policies (
  policy_id text primary key,
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.requests (
  request_id text primary key,
  policy_id text not null references public.policies(policy_id),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.verification_receipts (
  request_id text primary key references public.requests(request_id) on delete cascade,
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.decisions (
  request_id text primary key references public.requests(request_id) on delete cascade,
  policy_id text not null,
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.anchors (
  request_id text primary key references public.requests(request_id) on delete cascade,
  chain_id bigint not null,
  contract_address text not null,
  request_tx text not null,
  decision_tx text,
  created_at timestamptz not null default now()
);

create table if not exists public.evidence_bundles (
  request_id text primary key references public.requests(request_id) on delete cascade,
  policy_id text not null references public.policies(policy_id),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists requests_policy_id_idx on public.requests(policy_id);
create index if not exists decisions_policy_id_idx on public.decisions(policy_id);
create index if not exists evidence_bundles_policy_id_idx on public.evidence_bundles(policy_id);

alter table public.policies enable row level security;
alter table public.requests enable row level security;
alter table public.verification_receipts enable row level security;
alter table public.decisions enable row level security;
alter table public.anchors enable row level security;
alter table public.evidence_bundles enable row level security;

-- Gateway completion uses one database transaction. Signed policy, request,
-- receipt, and decision JSON cannot be replaced by a different record with
-- the same ID; anchors and the bundle itself may advance from pending to done.
create or replace function public.persist_evidence_bundle(p_bundle jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id text := p_bundle->'request'->>'request_id';
  v_policy_id text := p_bundle->'policy'->>'policy_id';
  v_decision jsonb := p_bundle->'decision';
begin
  perform pg_advisory_xact_lock(hashtextextended(v_policy_id, 1));
  perform pg_advisory_xact_lock(hashtextextended(v_request_id, 2));
  if exists (select 1 from policies where policy_id = v_policy_id and record is distinct from p_bundle->'policy') then
    raise exception 'IMMUTABLE_POLICY_CONFLICT';
  end if;
  if exists (select 1 from requests where request_id = v_request_id and record is distinct from p_bundle->'request') then
    raise exception 'IMMUTABLE_REQUEST_CONFLICT';
  end if;
  if exists (select 1 from verification_receipts where request_id = v_request_id and record is distinct from p_bundle->'verification_receipt') then
    raise exception 'IMMUTABLE_RECEIPT_CONFLICT';
  end if;
  if v_decision is not null and exists (select 1 from decisions where request_id = v_request_id and record is distinct from v_decision) then
    raise exception 'IMMUTABLE_DECISION_CONFLICT';
  end if;

  insert into policies(policy_id, record) values (v_policy_id, p_bundle->'policy')
    on conflict (policy_id) do nothing;
  insert into requests(request_id, policy_id, record) values (v_request_id, p_bundle->'request'->>'policy_id', p_bundle->'request')
    on conflict (request_id) do nothing;
  insert into verification_receipts(request_id, record) values (v_request_id, p_bundle->'verification_receipt')
    on conflict (request_id) do nothing;
  insert into anchors(request_id, chain_id, contract_address, request_tx, decision_tx)
    values (v_request_id, (p_bundle->'anchors'->>'chain_id')::bigint, p_bundle->'anchors'->>'contract_address', p_bundle->'anchors'->>'request_tx', nullif(p_bundle->'anchors'->>'decision_tx', ''))
    on conflict (request_id) do update set chain_id = excluded.chain_id, contract_address = excluded.contract_address, request_tx = excluded.request_tx, decision_tx = excluded.decision_tx;
  if v_decision is not null then
    insert into decisions(request_id, policy_id, record) values (v_request_id, v_decision->>'policy_id', v_decision)
      on conflict (request_id) do nothing;
  end if;
  insert into evidence_bundles(request_id, policy_id, record) values (v_request_id, v_policy_id, p_bundle)
    on conflict (request_id) do update set policy_id = excluded.policy_id, record = excluded.record;
end;
$$;

revoke execute on function public.persist_evidence_bundle(jsonb) from public, anon, authenticated;
grant execute on function public.persist_evidence_bundle(jsonb) to service_role;
