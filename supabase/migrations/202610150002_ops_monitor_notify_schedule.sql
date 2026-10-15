begin;

create extension if not exists pg_net with schema public;

create table public.ops_monitor_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  project_ref text,
  alert_email text not null default 'sugawara@saltlight.co.jp',
  updated_at timestamptz not null default now(),
  constraint ops_monitor_project_ref_check
    check (project_ref is null or project_ref ~ '^[a-z0-9]{20}$')
);

insert into public.ops_monitor_settings (singleton) values (true);

alter table public.ops_monitor_settings enable row level security;
revoke all on public.ops_monitor_settings from public, anon, authenticated;

-- Generate the bearer credential inside the database; it is never stored in
-- source control, a GitHub secret, or a client-side environment variable.
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'ops_monitor_call_token'
);

create function public.verify_ops_monitor_call(input_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $function$
declare
  settings record;
  stored_token text;
begin
  select enabled, alert_email into settings
  from public.ops_monitor_settings where singleton = true;
  if not found or not settings.enabled then
    return jsonb_build_object('authorized', false);
  end if;

  select decrypted_secret into stored_token
  from vault.decrypted_secrets
  where name = 'ops_monitor_call_token';

  return jsonb_build_object(
    'authorized', stored_token is not null and input_token = stored_token,
    'alert_email', settings.alert_email
  );
end;
$function$;

revoke all on function public.verify_ops_monitor_call(text)
  from public, anon, authenticated;
grant execute on function public.verify_ops_monitor_call(text)
  to service_role;

create function public.invoke_ops_monitor_notify()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $function$
declare
  settings record;
  stored_token text;
begin
  select enabled, project_ref into settings
  from public.ops_monitor_settings where singleton = true;
  if not found or not settings.enabled then
    return null;
  end if;
  if settings.project_ref is null then
    raise exception 'ops monitor project ref is not configured';
  end if;

  select decrypted_secret into stored_token
  from vault.decrypted_secrets
  where name = 'ops_monitor_call_token';
  if stored_token is null then
    raise exception 'ops monitor call token is missing';
  end if;

  return net.http_post(
    url := format(
      'https://%s.supabase.co/functions/v1/ops-monitor-notify',
      settings.project_ref
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || stored_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$function$;

revoke all on function public.invoke_ops_monitor_notify()
  from public, anon, authenticated;
grant execute on function public.invoke_ops_monitor_notify()
  to service_role;

select cron.schedule(
  'ops-monitor-notify',
  '8,23,38,53 * * * *',
  'select public.invoke_ops_monitor_notify()'
);

commit;
