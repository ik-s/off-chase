create or replace function public.persist_evidence_bundle(p_bundle jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id text := p_bundle->'request'->>'request_id';
  v_policy_id text := p_bundle->'policy'->>'policy_id';
  v_decision jsonb := nullif(p_bundle->'decision', 'null'::jsonb);
begin
  perform pg_advisory_xact_lock(hashtextextended(v_policy_id, 1));
  perform pg_advisory_xact_lock(hashtextextended(v_request_id, 2));
  if v_decision is null and exists (select 1 from evidence_bundles where request_id = v_request_id and nullif(record->'decision', 'null'::jsonb) is not null) then
    raise exception 'COMPLETED_BUNDLE_DOWNGRADE';
  end if;
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
