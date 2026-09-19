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
