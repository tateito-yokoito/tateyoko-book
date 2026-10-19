begin;

alter table public.ops_monitor_settings
  add column incident_alerts_enabled boolean not null default false;

-- Customer-level operational history stays in the database, never in the
-- public alert feed. The application never writes this table directly.
create table public.ops_error_incidents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'voice_upload_failed', 'voice_transcription_failed', 'answer_save_failed'
  )),
  failure_point text not null default 'unknown',
  error_code text,
  http_status integer,
  actor_user_id uuid references auth.users(id) on delete set null,
  book_project_id uuid references public.book_projects(id) on delete set null,
  user_question_id uuid references public.user_questions(id) on delete set null,
  answer_id uuid,
  attempt_count integer not null default 1 check (attempt_count > 0),
  importance text not null default 'record' check (importance in ('record', 'review', 'urgent')),
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  last_activity_log_id uuid unique references public.activity_logs(id) on delete set null,
  notified_importance text not null default 'record' check (notified_importance in ('record', 'review', 'urgent')),
  notification_claimed_at timestamptz,
  email_sent_at timestamptz
);

create index ops_error_incidents_recent_idx
  on public.ops_error_incidents (last_seen_at desc);
create index ops_error_incidents_actor_idx
  on public.ops_error_incidents (actor_user_id, last_seen_at desc);
create index ops_error_incidents_project_idx
  on public.ops_error_incidents (book_project_id, last_seen_at desc);
create index ops_error_incidents_open_idx
  on public.ops_error_incidents (kind, actor_user_id, book_project_id, failure_point, last_seen_at desc)
  where status in ('open', 'investigating');
create index ops_error_incidents_pending_idx
  on public.ops_error_incidents (last_seen_at)
  where status in ('open', 'investigating') and importance in ('review', 'urgent');

alter table public.ops_error_incidents enable row level security;
revoke all on public.ops_error_incidents from public, anon, authenticated;
grant select, update on public.ops_error_incidents to service_role;

create table public.ops_error_incident_events (
  activity_log_id uuid primary key references public.activity_logs(id) on delete cascade,
  incident_id uuid not null references public.ops_error_incidents(id) on delete cascade,
  occurred_at timestamptz not null,
  attempt_id uuid
);
create index ops_error_incident_events_incident_idx
  on public.ops_error_incident_events (incident_id, occurred_at desc);
alter table public.ops_error_incident_events enable row level security;
revoke all on public.ops_error_incident_events from public, anon, authenticated;
grant select on public.ops_error_incident_events to service_role;

create function public.track_ops_error_activity()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare
  target public.ops_error_incidents%rowtype;
  point text;
  code text;
  status_code integer;
  question_id uuid;
  attempt_id uuid;
  next_count integer;
begin
  if new.action in ('voice_upload_succeeded', 'answer_created', 'answer_updated') then
    update public.ops_error_incidents i set
      status = 'resolved', resolved_at = new.created_at,
      notification_claimed_at = null
    where i.status in ('open', 'investigating')
      and i.actor_user_id = new.actor_user_id
      and i.book_project_id is not distinct from new.book_project_id
      and i.answer_id is not distinct from new.answer_id
      and i.kind = case when new.action = 'voice_upload_succeeded'
        then 'voice_upload_failed' else 'answer_save_failed' end;
    return new;
  end if;

  if new.outcome <> 'failure' or new.action not in (
    'voice_upload_failed', 'voice_transcription_failed', 'answer_save_failed'
  ) then return new; end if;

  point := coalesce(nullif(left(new.metadata ->> 'failure_point', 40), ''),
    nullif(left(new.metadata ->> 'stage', 40), ''), 'unknown');
  if point !~ '^[a-z_]{1,40}$' then point := 'unknown'; end if;
  code := nullif(left(new.metadata ->> 'error_code', 40), '');
  if code !~ '^[A-Za-z0-9_-]{1,40}$' then code := null; end if;
  if (new.metadata ->> 'http_status') ~ '^[0-9]{3}$' then
    status_code := (new.metadata ->> 'http_status')::integer;
  end if;
  if (new.metadata ->> 'user_question_id') ~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    question_id := (new.metadata ->> 'user_question_id')::uuid;
  end if;
  if (new.metadata ->> 'attempt_id') ~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    attempt_id := (new.metadata ->> 'attempt_id')::uuid;
  end if;

  -- Serialize only equivalent failures so simultaneous retries cannot create
  -- two open incidents. A later failure after 30 minutes starts a new case.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', new.action,
    coalesce(new.actor_user_id::text, ''),
    coalesce(new.book_project_id::text, ''), point), 0));
  select * into target from public.ops_error_incidents i
  where i.kind = new.action
    and i.actor_user_id is not distinct from new.actor_user_id
    and i.book_project_id is not distinct from new.book_project_id
    and i.failure_point = point
    and i.status in ('open', 'investigating')
    and i.last_seen_at >= new.created_at - interval '30 minutes'
  order by i.last_seen_at desc limit 1 for update;

  if found then
    next_count := target.attempt_count + 1;
    update public.ops_error_incidents set
      attempt_count = next_count,
      last_seen_at = new.created_at,
      last_activity_log_id = new.id,
      error_code = coalesce(code, error_code),
      http_status = coalesce(status_code, http_status),
      user_question_id = coalesce(question_id, user_question_id),
      answer_id = coalesce(new.answer_id, answer_id),
      importance = case when next_count >= 3 then 'urgent'
        when next_count >= 2 then 'review' else 'record' end
    where id = target.id;
  else
    insert into public.ops_error_incidents (
      kind, failure_point, error_code, http_status, actor_user_id,
      book_project_id, user_question_id, answer_id, first_seen_at,
      last_seen_at, last_activity_log_id
    ) values (
      new.action, point, code, status_code, new.actor_user_id,
      new.book_project_id, question_id, new.answer_id, new.created_at,
      new.created_at, new.id
    ) returning * into target;
  end if;
  insert into public.ops_error_incident_events (
    activity_log_id, incident_id, occurred_at, attempt_id
  ) values (new.id, target.id, new.created_at, attempt_id);
  return new;
end;
$function$;

revoke all on function public.track_ops_error_activity() from public, anon, authenticated;
create trigger activity_logs_ops_error
after insert on public.activity_logs
for each row execute function public.track_ops_error_activity();

create function public.admin_ops_error_history(input_limit integer default 100)
returns jsonb language plpgsql security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'incidents', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.last_seen_at desc), '[]'::jsonb)
      from (
        select i.id, i.kind, i.failure_point, i.error_code, i.http_status,
          i.actor_user_id, i.book_project_id, i.user_question_id, i.answer_id,
          i.attempt_count, i.importance, i.status, i.first_seen_at,
          i.last_seen_at, i.resolved_at, i.email_sent_at,
          (select coalesce(jsonb_agg(jsonb_build_object(
            'occurred_at', e.occurred_at, 'attempt_id', e.attempt_id
          ) order by e.occurred_at), '[]'::jsonb)
           from public.ops_error_incident_events e where e.incident_id = i.id) as events,
          u.email as actor_email,
          coalesce(nullif(to_jsonb(p) ->> 'display_name', ''),
            nullif(to_jsonb(p) ->> 'name', ''), u.email) as actor_name,
          bp.title as project_title
        from public.ops_error_incidents i
        left join auth.users u on u.id = i.actor_user_id
        left join public.profiles p on p.id = i.actor_user_id
        left join public.book_projects bp on bp.id = i.book_project_id
        order by i.last_seen_at desc limit least(greatest(input_limit, 1), 250)
      ) r
    ),
    'legacy_findings', (
      select coalesce(jsonb_agg(to_jsonb(f) order by f.last_detected_at desc), '[]'::jsonb)
      from (
        select kind, severity, affected_count, first_detected_at,
          last_detected_at, email_sent_at
        from public.ops_monitor_findings
        where kind in ('voice_save_failed', 'voice_transcription_failed', 'answer_save_failed')
          and first_detected_at >= now() - interval '7 days'
        order by last_detected_at desc limit 30
      ) f
    )
  );
end;
$function$;
revoke all on function public.admin_ops_error_history(integer) from public, anon;
grant execute on function public.admin_ops_error_history(integer) to authenticated;

create function public.admin_set_ops_error_status(input_id uuid, input_status text)
returns void language plpgsql security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if input_status not in ('open', 'investigating', 'resolved') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update public.ops_error_incidents set status = input_status,
    resolved_at = case when input_status = 'resolved' then now() else null end,
    notification_claimed_at = null
  where id = input_id;
end;
$function$;
revoke all on function public.admin_set_ops_error_status(uuid, text) from public, anon;
grant execute on function public.admin_set_ops_error_status(uuid, text) to authenticated;

commit;
