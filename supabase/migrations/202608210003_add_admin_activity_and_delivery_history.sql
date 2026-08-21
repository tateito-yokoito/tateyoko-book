begin;

-- 利用履歴は1件のイベントをアカウントと物語の両方から参照する。
alter table public.activity_logs
  add column if not exists subject_user_id uuid references auth.users(id) on delete set null,
  add column if not exists source text not null default 'app',
  add column if not exists outcome text not null default 'success';

create index if not exists activity_logs_subject_user_created_idx
  on public.activity_logs(subject_user_id, created_at desc);

create index if not exists activity_logs_project_created_idx
  on public.activity_logs(book_project_id, created_at desc);

-- 問いの配信は宛先（アカウント）と制作対象（物語）の両方を必ず保持する。
create table if not exists public.question_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  book_project_id uuid not null references public.book_projects(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email text,
  user_question_id uuid references public.user_questions(id) on delete set null,
  notification_schedule_id uuid references public.notification_schedules(id) on delete set null,
  delivery_channel text not null default 'email',
  delivery_status text not null default 'scheduled',
  scheduled_for timestamptz,
  attempted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  answered_at timestamptz,
  failed_at timestamptz,
  provider_message_id text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_delivery_logs_channel_check
    check (delivery_channel in ('email', 'sms', 'line')),
  constraint question_delivery_logs_status_check
    check (delivery_status in (
      'scheduled', 'sending', 'sent', 'delivered', 'opened',
      'answered', 'failed', 'cancelled'
    ))
);

create index if not exists question_delivery_logs_project_created_idx
  on public.question_delivery_logs(book_project_id, created_at desc);

create index if not exists question_delivery_logs_recipient_created_idx
  on public.question_delivery_logs(recipient_user_id, created_at desc);

create index if not exists question_delivery_logs_status_scheduled_idx
  on public.question_delivery_logs(delivery_status, scheduled_for desc);

create unique index if not exists question_delivery_logs_provider_message_unique
  on public.question_delivery_logs(provider_message_id)
  where provider_message_id is not null;

drop trigger if exists question_delivery_logs_updated_at on public.question_delivery_logs;
create trigger question_delivery_logs_updated_at
before update on public.question_delivery_logs
for each row execute function public.set_tateyoko_updated_at();

alter table public.question_delivery_logs enable row level security;

comment on table public.question_delivery_logs is
  '問いの配信ライフサイクル。宛先アカウントと対象物語を両方保持し、管理画面と配信Webhookから利用する。';

-- 回答・問い状態・物語状態の重要な変化は、クライアントのログ送信に依存せずDBで記録する。
create or replace function public.log_answer_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.activity_logs (
    actor_user_id, subject_user_id, action, entity_type, entity_id,
    book_project_id, answer_id, source, outcome, metadata, created_at
  ) values (
    new.user_id,
    new.user_id,
    case when tg_op = 'INSERT' then 'answer_created' else 'answer_updated' end,
    'answer',
    new.id,
    new.book_project_id,
    new.id,
    'database',
    'success',
    jsonb_strip_nulls(jsonb_build_object(
      'sequence_order', new.sequence_order,
      'question_id', new.question_id,
      'user_question_id', new.user_question_id,
      'story_origin', new.meta_json ->> 'story_origin'
    )),
    case when tg_op = 'INSERT' then coalesce(new.created_at, now()) else now() end
  );
  return new;
end;
$$;

drop trigger if exists answers_activity_log on public.answers;
create trigger answers_activity_log
after insert or update on public.answers
for each row execute function public.log_answer_activity_event();

create or replace function public.log_question_status_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('answered', 'skipped') then
    insert into public.activity_logs (
      actor_user_id, subject_user_id, action, entity_type, entity_id,
      book_project_id, source, outcome, metadata
    ) values (
      new.user_id,
      new.user_id,
      case new.status when 'answered' then 'question_answered' else 'question_skipped' end,
      'user_question',
      new.id,
      new.book_project_id,
      'database',
      'success',
      jsonb_strip_nulls(jsonb_build_object(
        'question_id', new.question_id,
        'sequence_order', new.sequence_order
      ))
    );

    if new.status = 'answered' then
      update public.question_delivery_logs
      set delivery_status = 'answered', answered_at = coalesce(answered_at, now())
      where user_question_id = new.id
        and delivery_status not in ('answered', 'cancelled');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_questions_activity_log on public.user_questions;
create trigger user_questions_activity_log
after update of status on public.user_questions
for each row execute function public.log_question_status_activity_event();

create or replace function public.log_project_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_logs (
      actor_user_id, subject_user_id, action, entity_type, entity_id,
      book_project_id, source, outcome, created_at
    ) values (
      new.owner_user_id, new.owner_user_id, 'project_created', 'book_project', new.id,
      new.id, 'database', 'success', coalesce(new.created_at, now())
    );
  elsif new.access_status is distinct from old.access_status then
    insert into public.activity_logs (
      actor_user_id, subject_user_id, action, entity_type, entity_id,
      book_project_id, source, outcome, metadata
    ) values (
      new.owner_user_id, new.owner_user_id, 'project_access_changed', 'book_project', new.id,
      new.id, 'database', 'success',
      jsonb_build_object('from', old.access_status, 'to', new.access_status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists book_projects_activity_log on public.book_projects;
create trigger book_projects_activity_log
after insert or update of access_status on public.book_projects
for each row execute function public.log_project_activity_event();

-- 既存データにも最低限の履歴を与える。本文・音声・個人情報はmetadataへ複製しない。
insert into public.activity_logs (
  actor_user_id, subject_user_id, action, entity_type, entity_id,
  source, outcome, created_at, metadata
)
select u.id, u.id, 'account_registered', 'account', u.id,
  'backfill', 'success', u.created_at, '{}'::jsonb
from auth.users u
where not exists (
  select 1 from public.activity_logs al
  where al.action = 'account_registered' and al.entity_id = u.id
);

insert into public.activity_logs (
  actor_user_id, subject_user_id, action, entity_type, entity_id,
  book_project_id, source, outcome, created_at, metadata
)
select bp.owner_user_id, bp.owner_user_id, 'project_created', 'book_project', bp.id,
  bp.id, 'backfill', 'success', bp.created_at, '{}'::jsonb
from public.book_projects bp
where not exists (
  select 1 from public.activity_logs al
  where al.action = 'project_created' and al.entity_id = bp.id
);

insert into public.activity_logs (
  actor_user_id, subject_user_id, action, entity_type, entity_id,
  book_project_id, answer_id, source, outcome, created_at, metadata
)
select a.user_id, a.user_id, 'answer_created', 'answer', a.id,
  a.book_project_id, a.id, 'backfill', 'success', a.created_at,
  jsonb_strip_nulls(jsonb_build_object(
    'sequence_order', a.sequence_order,
    'question_id', a.question_id,
    'user_question_id', a.user_question_id,
    'story_origin', a.meta_json ->> 'story_origin'
  ))
from public.answers a
where not exists (
  select 1 from public.activity_logs al
  where al.action = 'answer_created' and al.answer_id = a.id
);

create or replace function public.get_admin_usage_history(
  input_account_id uuid default null,
  input_project_id uuid default null,
  input_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
  safe_limit integer := least(greatest(coalesce(input_limit, 100), 1), 500);
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if input_account_id is null and input_project_id is null then
    raise exception 'Account or project is required' using errcode = '22023';
  end if;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'view_usage_history',
    case when input_project_id is not null then 'book_project' else 'account' end,
    coalesce(input_project_id, input_account_id),
    jsonb_strip_nulls(jsonb_build_object(
      'account_id', input_account_id,
      'book_project_id', input_project_id
    ))
  );

  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at desc), '[]'::jsonb)
  into result
  from (
    select
      al.id,
      al.action,
      al.entity_type,
      al.entity_id,
      al.actor_user_id,
      al.subject_user_id,
      al.book_project_id,
      al.answer_id,
      al.source,
      al.outcome,
      al.metadata,
      al.created_at,
      actor.email as actor_email,
      coalesce(
        nullif(to_jsonb(actor_profile) ->> 'display_name', ''),
        nullif(to_jsonb(actor_profile) ->> 'name', ''),
        actor.email
      ) as actor_name,
      coalesce(
        nullif(to_jsonb(subject_person) ->> 'preferred_name', ''),
        nullif(to_jsonb(subject_person) ->> 'display_name', ''),
        bp.title
      ) as project_name
    from public.activity_logs al
    left join auth.users actor on actor.id = al.actor_user_id
    left join public.profiles actor_profile on actor_profile.id = al.actor_user_id
    left join public.book_projects bp on bp.id = al.book_project_id
    left join public.persons subject_person on subject_person.id = bp.subject_person_id
    where (input_account_id is null
      or al.actor_user_id = input_account_id
      or al.subject_user_id = input_account_id)
      and (input_project_id is null or al.book_project_id = input_project_id)
    order by al.created_at desc
    limit safe_limit
  ) rows;

  return result;
end;
$$;

create or replace function public.get_admin_delivery_history(
  input_account_id uuid default null,
  input_project_id uuid default null,
  input_search text default null,
  input_status text default null,
  input_limit integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
  normalized_search text := lower(btrim(coalesce(input_search, '')));
  normalized_status text := lower(btrim(coalesce(input_status, '')));
  safe_limit integer := least(greatest(coalesce(input_limit, 250), 1), 500);
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'view_delivery_history',
    case
      when input_project_id is not null then 'book_project'
      when input_account_id is not null then 'account'
      else 'delivery'
    end,
    coalesce(input_project_id, input_account_id),
    jsonb_strip_nulls(jsonb_build_object(
      'account_id', input_account_id,
      'book_project_id', input_project_id,
      'status', nullif(normalized_status, ''),
      'search', nullif(normalized_search, '')
    ))
  );

  with delivery_rows as (
    select
      qdl.id,
      'question'::text as delivery_kind,
      qdl.book_project_id,
      null::uuid as actor_user_id,
      qdl.recipient_user_id,
      qdl.recipient_email,
      coalesce(uq.custom_question_text, uq.question_text_snapshot, q.content, '') as subject,
      qdl.delivery_channel,
      qdl.delivery_status,
      qdl.scheduled_for,
      qdl.attempted_at,
      qdl.sent_at,
      qdl.delivered_at,
      qdl.opened_at,
      qdl.answered_at,
      qdl.provider_message_id,
      qdl.error_message,
      qdl.created_at
    from public.question_delivery_logs qdl
    left join public.user_questions uq on uq.id = qdl.user_question_id
    left join public.questions q on q.id = uq.question_id

    union all

    select
      pi.id,
      'supporter_invite'::text,
      pi.book_project_id,
      pi.inviter_user_id,
      null::uuid,
      pi.invitee_email,
      'お手伝いする人への招待'::text,
      'email'::text,
      pi.email_delivery_status,
      null::timestamptz,
      pi.email_attempted_at,
      pi.email_sent_at,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
      pi.email_message_id,
      pi.email_error,
      pi.created_at
    from public.project_invites pi

    union all

    select
      sri.id,
      'relationship_invite'::text,
      sri.book_project_id,
      sri.inviter_user_id,
      sri.recipient_user_id,
      sri.invitee_email,
      '物語を届ける相手への招待'::text,
      'email'::text,
      sri.email_delivery_status,
      null::timestamptz,
      sri.email_attempted_at,
      sri.email_sent_at,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
      null::text,
      sri.email_error,
      sri.created_at
    from public.story_relationship_invites sri
  ), enriched as (
    select
      dr.*,
      coalesce(
        nullif(to_jsonb(subject_person) ->> 'preferred_name', ''),
        nullif(to_jsonb(subject_person) ->> 'display_name', ''),
        bp.title,
        '名称未登録'
      ) as project_name,
      coalesce(recipient.email, dr.recipient_email) as resolved_recipient_email,
      greatest(
        coalesce(dr.answered_at, '-infinity'::timestamptz),
        coalesce(dr.opened_at, '-infinity'::timestamptz),
        coalesce(dr.delivered_at, '-infinity'::timestamptz),
        coalesce(dr.sent_at, '-infinity'::timestamptz),
        coalesce(dr.attempted_at, '-infinity'::timestamptz),
        coalesce(dr.scheduled_for, '-infinity'::timestamptz),
        dr.created_at
      ) as event_at
    from delivery_rows dr
    join public.book_projects bp on bp.id = dr.book_project_id
    left join public.persons subject_person on subject_person.id = bp.subject_person_id
    left join auth.users recipient on recipient.id = dr.recipient_user_id
    where (input_account_id is null
      or dr.actor_user_id = input_account_id
      or dr.recipient_user_id = input_account_id)
      and (input_project_id is null or dr.book_project_id = input_project_id)
  )
  select coalesce(jsonb_agg(to_jsonb(filtered) order by filtered.event_at desc), '[]'::jsonb)
  into result
  from (
    select *
    from enriched e
    where (normalized_status = '' or lower(e.delivery_status) = normalized_status)
      and (
        normalized_search = ''
        or lower(concat_ws(' ',
          e.project_name,
          e.resolved_recipient_email,
          e.subject,
          e.delivery_kind,
          e.book_project_id::text,
          e.id::text
        )) like '%' || normalized_search || '%'
      )
    order by e.event_at desc
    limit safe_limit
  ) filtered;

  return result;
end;
$$;

create or replace function public.get_admin_account_detail(input_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = input_account_id) then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id)
  values (auth.uid(), 'view_account_detail', 'account', input_account_id);

  select jsonb_build_object(
    'account', (
      select jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'display_name', coalesce(
          nullif(to_jsonb(p) ->> 'display_name', ''),
          nullif(to_jsonb(p) ->> 'name', ''),
          nullif(to_jsonb(p) ->> 'preferred_name', ''),
          u.email,
          '名称未登録'
        ),
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at
      )
      from auth.users u
      left join public.profiles p on p.id = u.id
      where u.id = input_account_id
    ),
    'owned_projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'name', coalesce(
          nullif(to_jsonb(person) ->> 'preferred_name', ''),
          nullif(to_jsonb(person) ->> 'display_name', ''),
          bp.title,
          '名称未登録'
        ),
        'access_status', bp.access_status,
        'onboarding_status', bp.onboarding_status,
        'created_at', bp.created_at,
        'purchased_at', bp.purchased_at
      ) order by bp.created_at desc)
      from public.book_projects bp
      left join public.persons person on person.id = bp.subject_person_id
      where bp.owner_user_id = input_account_id
    ), '[]'::jsonb),
    'supporting_projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'name', coalesce(
          nullif(to_jsonb(person) ->> 'preferred_name', ''),
          nullif(to_jsonb(person) ->> 'display_name', ''),
          bp.title,
          '名称未登録'
        ),
        'support_status', ps.status,
        'created_at', ps.created_at
      ) order by ps.created_at desc)
      from public.project_supporters ps
      join public.book_projects bp on bp.id = ps.book_project_id
      left join public.persons person on person.id = bp.subject_person_id
      where ps.supporter_user_id = input_account_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on table public.question_delivery_logs from public, anon, authenticated;
grant all on table public.question_delivery_logs to service_role;
grant select, insert on table public.activity_logs to authenticated;
revoke all on function public.get_admin_usage_history(uuid, uuid, integer) from public;
revoke all on function public.get_admin_delivery_history(uuid, uuid, text, text, integer) from public;
revoke all on function public.get_admin_account_detail(uuid) from public;

grant execute on function public.get_admin_usage_history(uuid, uuid, integer) to authenticated;
grant execute on function public.get_admin_delivery_history(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.get_admin_account_detail(uuid) to authenticated;

commit;
