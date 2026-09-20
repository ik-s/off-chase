-- One database-wide writer. Stale locks require manual recovery after checking
-- pending transactions; an expired function must never race a new writer.
create table public.demo_writer_control (
  id integer primary key check (id = 1),
  run_id text,
  started_at timestamptz,
  usage_day date not null default current_date,
  daily_count integer not null default 0
);
alter table public.demo_writer_control enable row level security;
revoke all on public.demo_writer_control from anon, authenticated;
grant select, insert, update on public.demo_writer_control to service_role;
insert into public.demo_writer_control(id) values (1);

create function public.acquire_demo_writer(p_run_id text, p_daily_limit integer)
returns text language plpgsql security invoker set search_path = '' as $$
declare current_row public.demo_writer_control;
begin
  if p_daily_limit < 1 or p_daily_limit > 100 or p_run_id is null then
    raise exception 'INVALID_RUN_CONTROL_INPUT';
  end if;
  select * into strict current_row from public.demo_writer_control where id = 1 for update;
  if current_row.run_id is not null then return 'BUSY'; end if;
  if current_row.usage_day = current_date and current_row.daily_count >= p_daily_limit then
    return 'DAILY_LIMIT';
  end if;
  update public.demo_writer_control set run_id = p_run_id, started_at = now(),
    usage_day = current_date,
    daily_count = case when usage_day = current_date then daily_count + 1 else 1 end
    where id = 1;
  return 'ACQUIRED';
end;
$$;
create function public.release_demo_writer(p_run_id text)
returns void language sql security invoker set search_path = '' as $$
  update public.demo_writer_control set run_id = null, started_at = null
    where id = 1 and run_id = p_run_id;
$$;
revoke execute on function public.acquire_demo_writer(text, integer) from public, anon, authenticated;
revoke execute on function public.release_demo_writer(text) from public, anon, authenticated;
grant execute on function public.acquire_demo_writer(text, integer) to service_role;
grant execute on function public.release_demo_writer(text) to service_role;
