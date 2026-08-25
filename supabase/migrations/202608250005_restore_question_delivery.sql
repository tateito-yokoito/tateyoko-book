begin;

-- A single scheduled slot must be claimed only once, even when the cron
-- request is retried or two Edge Function instances overlap.
create unique index if not exists question_delivery_logs_scheduled_attempt_unique
  on public.question_delivery_logs (
    user_question_id,
    notification_schedule_id,
    delivery_channel,
    scheduled_for
  )
  where user_question_id is not null
    and notification_schedule_id is not null
    and scheduled_for is not null;

-- The original delivery worker only consulted notification_preferences,
-- which contains the first slot for backwards compatibility. The product now
-- stores up to three active slots in notification_schedules, so the worker
-- needs a service-role-only view of every slot that is due this minute.
create or replace function public.get_due_question_deliveries_v2()
returns table (
  notification_schedule_id uuid,
  user_id uuid,
  book_project_id uuid,
  email text,
  phone_number text,
  user_name text,
  user_question_id uuid,
  question_id text,
  sequence_order integer,
  question_text text,
  scheduled_for timestamptz,
  email_enabled boolean,
  sms_enabled boolean,
  delivery_channel text
)
language sql
security definer
set search_path = public, auth
as $$
  with clock as (
    select
      now() at time zone 'Asia/Tokyo' as current_time,
      date_trunc('minute', now()) as scheduled_for
  ),
  due_users as (
    select
      ns.id as notification_schedule_id,
      ns.user_id,
      p.email,
      np.phone_number,
      coalesce(p.preferred_name, p.display_name, p.name, 'あなた') as user_name,
      coalesce(np.email_enabled, true) as email_enabled,
      coalesce(np.sms_enabled, false) as sms_enabled,
      coalesce(ns.delivery_channel, np.delivery_channel, 'email') as delivery_channel,
      c.scheduled_for
    from public.notification_schedules ns
    join public.notification_preferences np on np.user_id = ns.user_id
    join public.profiles p on p.id = ns.user_id
    cross join clock c
    where ns.enabled = true
      and coalesce(np.is_active, true) = true
      and ns.weekday = extract(dow from c.current_time)::integer
      and ns.hour = extract(hour from c.current_time)::integer
      and ns.minute = extract(minute from c.current_time)::integer
      and (
        (coalesce(np.email_enabled, true) = true and nullif(btrim(p.email), '') is not null)
        or
        (coalesce(np.sms_enabled, false) = true and nullif(btrim(np.phone_number), '') is not null)
      )
      and not exists (
        select 1
        from public.admin_retired_accounts retired
        where retired.account_id = ns.user_id
          and retired.restored_at is null
      )
  ),
  next_questions as (
    select distinct on (uq.user_id)
      uq.user_id,
      uq.id as user_question_id,
      uq.book_project_id,
      uq.question_id::text as question_id,
      uq.sequence_order,
      coalesce(
        uq.custom_question_text,
        uq.question_text_snapshot,
        q.content
      ) as question_text
    from public.user_questions uq
    join public.book_projects bp on bp.id = uq.book_project_id
    left join public.questions q on q.id = uq.question_id
    where uq.is_active = true
      and uq.answered_at is null
      and uq.delivered_at is null
      and bp.status = 'active'
      and not exists (
        select 1
        from public.admin_trash_entries trash
        where trash.entity_type = 'book_project'
          and trash.entity_id = uq.book_project_id
      )
      and not exists (
        select 1
        from public.notification_deliveries nd
        where nd.user_question_id = uq.id
          and nd.status = 'sent'
      )
    order by uq.user_id, uq.sequence_order, uq.created_at, uq.id
  )
  select
    du.notification_schedule_id,
    du.user_id,
    nq.book_project_id,
    du.email,
    du.phone_number,
    du.user_name,
    nq.user_question_id,
    nq.question_id,
    nq.sequence_order,
    nq.question_text,
    du.scheduled_for,
    du.email_enabled,
    du.sms_enabled,
    du.delivery_channel
  from due_users du
  join next_questions nq on nq.user_id = du.user_id
  where nq.question_text is not null;
$$;

revoke all on function public.get_due_question_deliveries_v2() from public, anon, authenticated;
grant execute on function public.get_due_question_deliveries_v2() to service_role;

comment on function public.get_due_question_deliveries_v2() is
  '有効な全配信スロットから今分の次回質問を取得する、配信ワーカー専用関数。';

commit;
