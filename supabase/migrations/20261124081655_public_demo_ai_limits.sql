-- Anonymous demo AI usage counters only. No recording or transcript is stored.
create table public.public_demo_ai_usage (
  quota_scope text not null check (quota_scope in ('browser', 'ip_10m', 'global_day', 'global_month')),
  subject_key text not null,
  window_key text not null,
  used_count integer not null default 0 check (used_count >= 0),
  last_used_at timestamptz not null default now(),
  primary key (quota_scope, subject_key, window_key)
);

alter table public.public_demo_ai_usage enable row level security;
revoke all on public.public_demo_ai_usage from public, anon, authenticated;
grant select, insert, update, delete on public.public_demo_ai_usage to service_role;

-- A transaction-level lock makes all four limits atomic under concurrent calls.
-- Only the Edge Function's service role can reserve a slot.
create function public.reserve_public_demo_ai(input_browser_hash text, input_ip_hash text)
returns table (allowed boolean, remaining integer)
language plpgsql security invoker set search_path = ''
as $$
declare
  current_time timestamptz := clock_timestamp();
  browser_used integer;
  ip_used integer;
  day_used integer;
  month_used integer;
  browser_last timestamptz;
  ip_window text;
  day_window text;
  month_window text;
begin
  if input_browser_hash !~ '^[a-f0-9]{64}$' or input_ip_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid quota identity';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public-demo-ai-quota'));
  ip_window := floor(extract(epoch from current_time) / 600)::text;
  day_window := pg_catalog.to_char(current_time at time zone 'UTC', 'YYYY-MM-DD');
  month_window := pg_catalog.to_char(current_time at time zone 'UTC', 'YYYY-MM');

  select u.used_count, u.last_used_at into browser_used, browser_last
    from public.public_demo_ai_usage u
    where u.quota_scope = 'browser' and u.subject_key = input_browser_hash and u.window_key = 'all';
  select u.used_count into ip_used from public.public_demo_ai_usage u
    where u.quota_scope = 'ip_10m' and u.subject_key = input_ip_hash and u.window_key = ip_window;
  select u.used_count into day_used from public.public_demo_ai_usage u
    where u.quota_scope = 'global_day' and u.subject_key = 'all' and u.window_key = day_window;
  select u.used_count into month_used from public.public_demo_ai_usage u
    where u.quota_scope = 'global_month' and u.subject_key = 'all' and u.window_key = month_window;

  if coalesce(browser_used, 0) >= 2 or browser_last > current_time - interval '15 seconds'
     or coalesce(ip_used, 0) >= 6 or coalesce(day_used, 0) >= 100
     or coalesce(month_used, 0) >= 3000 then
    return query select false, greatest(0, 2 - coalesce(browser_used, 0));
    return;
  end if;

  insert into public.public_demo_ai_usage as u (quota_scope, subject_key, window_key, used_count, last_used_at)
  values ('browser', input_browser_hash, 'all', 1, current_time),
    ('ip_10m', input_ip_hash, ip_window, 1, current_time),
    ('global_day', 'all', day_window, 1, current_time),
    ('global_month', 'all', month_window, 1, current_time)
  on conflict (quota_scope, subject_key, window_key) do update
    set used_count = u.used_count + 1, last_used_at = excluded.last_used_at;

  return query select true, greatest(0, 1 - coalesce(browser_used, 0));
end;
$$;

revoke all on function public.reserve_public_demo_ai(text, text) from public, anon, authenticated;
grant execute on function public.reserve_public_demo_ai(text, text) to service_role;
