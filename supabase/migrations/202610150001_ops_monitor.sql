begin;

-- These records contain aggregate counts only. Never copy a voice, transcript,
-- question, recipient address, token, or individual account into an alert.
create table public.ops_monitor_runs (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  failed_deliveries integer not null default 0,
  stuck_deliveries integer not null default 0,
  voice_upload_failures integer not null default 0,
  voice_transcription_failures integer not null default 0,
  answer_save_failures integer not null default 0
);

create index ops_monitor_runs_checked_at_idx
  on public.ops_monitor_runs (checked_at desc);

create table public.ops_monitor_findings (
  fingerprint text primary key,
  kind text not null check (kind in (
    'delivery_failed', 'delivery_stuck', 'voice_save_failed',
    'voice_transcription_failed', 'answer_save_failed',
    'site_unavailable'
  )),
  severity text not null check (severity in ('warning', 'critical')),
  affected_count integer not null check (affected_count > 0),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  email_sent_at timestamptz
);

create index ops_monitor_findings_unsent_idx
  on public.ops_monitor_findings (first_detected_at)
  where email_sent_at is null;

alter table public.ops_monitor_runs enable row level security;
alter table public.ops_monitor_findings enable row level security;
revoke all on public.ops_monitor_runs, public.ops_monitor_findings
  from public, anon, authenticated;
grant select on public.ops_monitor_runs to service_role;
grant select, insert, update on public.ops_monitor_findings to service_role;

-- Idempotent within each UTC hour, so a persistent incident does not create
-- four new messages every hour. A later hour is a new reminder if it persists.
create function public.scan_ops_monitor()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  bucket text := to_char(date_trunc('hour', now() at time zone 'UTC'), 'YYYYMMDDHH24');
  failed_count integer;
  stuck_count integer;
  upload_count integer;
  transcription_count integer;
  save_count integer;
begin
  select count(*)::integer into failed_count
  from public.question_delivery_logs
  where delivery_status = 'failed'
    and failed_at >= now() - interval '1 hour';

  select count(*)::integer into stuck_count
  from public.question_delivery_logs
  where delivery_status = 'sending'
    and coalesce(attempted_at, updated_at, created_at) < now() - interval '20 minutes'
    and created_at >= now() - interval '1 day';

  select
    count(*) filter (where action = 'voice_upload_failed')::integer,
    count(*) filter (where action = 'voice_transcription_failed')::integer,
    count(*) filter (where action = 'answer_save_failed')::integer
  into upload_count, transcription_count, save_count
  from public.activity_logs
  where outcome = 'failure'
    and created_at >= now() - interval '1 hour'
    and action in (
      'voice_upload_failed', 'voice_transcription_failed',
      'answer_save_failed'
    );

  insert into public.ops_monitor_runs (
    failed_deliveries, stuck_deliveries, voice_upload_failures,
    voice_transcription_failures, answer_save_failures
  ) values (failed_count, stuck_count, upload_count,
    transcription_count, save_count);

  if failed_count > 0 then
    insert into public.ops_monitor_findings (
      fingerprint, kind, severity, affected_count
    ) values ('delivery_failed:' || bucket, 'delivery_failed', 'critical', failed_count)
    on conflict (fingerprint) do update set
      affected_count = excluded.affected_count,
      last_detected_at = now();
  end if;

  if stuck_count > 0 then
    insert into public.ops_monitor_findings (
      fingerprint, kind, severity, affected_count
    ) values ('delivery_stuck:' || bucket, 'delivery_stuck', 'critical', stuck_count)
    on conflict (fingerprint) do update set
      affected_count = excluded.affected_count,
      last_detected_at = now();
  end if;

  -- Client-side telemetry can be lost when offline. Zero is never proof that
  -- voice saving succeeded; it only means no failure report was received.
  if upload_count > 0 then
    insert into public.ops_monitor_findings (
      fingerprint, kind, severity, affected_count
    ) values ('voice_save_failed:' || bucket, 'voice_save_failed', 'critical', upload_count)
    on conflict (fingerprint) do update set
      affected_count = excluded.affected_count,
      last_detected_at = now();
  end if;

  if transcription_count > 0 then
    insert into public.ops_monitor_findings (
      fingerprint, kind, severity, affected_count
    ) values (
      'voice_transcription_failed:' || bucket,
      'voice_transcription_failed', 'warning', transcription_count
    )
    on conflict (fingerprint) do update set
      affected_count = excluded.affected_count,
      last_detected_at = now();
  end if;

  if save_count > 0 then
    insert into public.ops_monitor_findings (
      fingerprint, kind, severity, affected_count
    ) values ('answer_save_failed:' || bucket, 'answer_save_failed', 'critical', save_count)
    on conflict (fingerprint) do update set
      affected_count = excluded.affected_count,
      last_detected_at = now();
  end if;

  return jsonb_build_object(
    'failed_deliveries', failed_count,
    'stuck_deliveries', stuck_count,
    'voice_upload_failures', upload_count,
    'voice_transcription_failures', transcription_count,
    'answer_save_failures', save_count
  );
end;
$function$;

revoke all on function public.scan_ops_monitor() from public, anon, authenticated;
grant execute on function public.scan_ops_monitor() to service_role;

create function public.admin_ops_monitor_status()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'latest_run', (
      select to_jsonb(r) from public.ops_monitor_runs r
      order by r.checked_at desc limit 1
    ),
    'recent_findings', (
      select coalesce(jsonb_agg(to_jsonb(f) order by f.last_detected_at desc), '[]'::jsonb)
      from (
        select kind, severity, affected_count, first_detected_at,
          last_detected_at, email_sent_at
        from public.ops_monitor_findings
        where first_detected_at >= now() - interval '7 days'
        order by last_detected_at desc limit 50
      ) f
    )
  );
end;
$function$;

revoke all on function public.admin_ops_monitor_status()
  from public, anon;
grant execute on function public.admin_ops_monitor_status()
  to authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'ops-monitor-scan',
  '*/15 * * * *',
  'select public.scan_ops_monitor()'
);

-- No account- or question-level data is retained by this monitor.
create function public.purge_ops_monitor_history()
returns void
language sql
security definer
set search_path = public, pg_temp
as $function$
  delete from public.ops_monitor_runs
  where checked_at < now() - interval '30 days';
  delete from public.ops_monitor_findings
  where first_detected_at < now() - interval '90 days';
$function$;
revoke all on function public.purge_ops_monitor_history()
  from public, anon, authenticated;
select cron.schedule(
  'purge-ops-monitor-history',
  '24 18 * * *',
  'select public.purge_ops_monitor_history()'
);

commit;
