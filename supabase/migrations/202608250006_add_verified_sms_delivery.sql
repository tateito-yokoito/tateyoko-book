begin;

alter table public.notification_preferences
  add column if not exists phone_verified_at timestamptz,
  add column if not exists sms_consent_at timestamptz;

alter table public.question_delivery_logs
  add column if not exists recipient_phone text;

-- 既存のSMS設定には電話番号の本人確認記録がないため、メール配信は残したまま
-- SMSだけを停止し、設定画面から改めて認証してもらう。
update public.notification_preferences
set
  sms_enabled = false,
  delivery_channel = 'email'
where coalesce(sms_enabled, false) = true
  and phone_verified_at is null;

update public.notification_schedules ns
set delivery_channel = 'email', updated_at = now()
where ns.user_id in (
  select np.user_id
  from public.notification_preferences np
  where coalesce(np.sms_enabled, false) = false
    and np.phone_verified_at is null
);

alter table public.notification_preferences
  drop constraint if exists notification_preferences_verified_sms_check;
alter table public.notification_preferences
  add constraint notification_preferences_verified_sms_check
  check (coalesce(sms_enabled, false) = false or phone_verified_at is not null);

create table if not exists public.phone_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  phone_number text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count smallint not null default 0,
  sent_at timestamptz not null default now(),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists phone_verification_challenges_updated_at
  on public.phone_verification_challenges;
create trigger phone_verification_challenges_updated_at
before update on public.phone_verification_challenges
for each row execute function public.set_tateyoko_updated_at();

alter table public.phone_verification_challenges enable row level security;
revoke all on table public.phone_verification_challenges from public, anon, authenticated;
grant all on table public.phone_verification_challenges to service_role;

-- 曜日・時刻の保存と受け取り方法の保存を分離する。時刻を変更しても、
-- 認証済み電話番号とSMS設定を消さない。
create or replace function public.save_own_notification_schedules(input_schedules jsonb)
returns table (
  id uuid,
  weekday integer,
  hour integer,
  minute integer,
  delivery_channel text,
  enabled boolean,
  sort_order smallint
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  schedule_count integer;
  duplicate_weekdays integer;
  first_schedule jsonb;
  selected_channel text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if jsonb_typeof(input_schedules) <> 'array' then
    raise exception 'Schedules must be an array';
  end if;

  schedule_count := jsonb_array_length(input_schedules);
  if schedule_count < 1 or schedule_count > 3 then
    raise exception 'One to three schedules are required';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(input_schedules) item
    where coalesce((item ->> 'weekday')::integer, -1) not between 0 and 6
       or coalesce((item ->> 'hour')::integer, -1) not between 0 and 23
       or coalesce((item ->> 'minute')::integer, -1) not between 0 and 59
  ) then
    raise exception 'Invalid schedule time';
  end if;

  select count(*) - count(distinct item ->> 'weekday')
  into duplicate_weekdays
  from jsonb_array_elements(input_schedules) item;

  if duplicate_weekdays > 0 then
    raise exception 'Only one schedule can be registered per weekday';
  end if;

  select case
    when coalesce(np.sms_enabled, false)
      and np.phone_verified_at is not null
      and nullif(btrim(np.phone_number), '') is not null
      then 'both'
    else 'email'
  end
  into selected_channel
  from public.notification_preferences np
  where np.user_id = auth.uid();

  selected_channel := coalesce(selected_channel, 'email');

  update public.notification_schedules ns
  set enabled = false, updated_at = now()
  where ns.user_id = auth.uid();

  insert into public.notification_schedules (
    user_id, weekday, hour, minute, delivery_channel, enabled, sort_order
  )
  select
    auth.uid(),
    (item ->> 'weekday')::integer,
    (item ->> 'hour')::integer,
    coalesce((item ->> 'minute')::integer, 0),
    selected_channel,
    true,
    ordinality::smallint
  from jsonb_array_elements(input_schedules) with ordinality as schedules(item, ordinality)
  on conflict on constraint notification_schedules_user_weekday_unique do update set
    hour = excluded.hour,
    minute = excluded.minute,
    delivery_channel = excluded.delivery_channel,
    enabled = true,
    sort_order = excluded.sort_order,
    updated_at = now();

  first_schedule := input_schedules -> 0;
  insert into public.notification_preferences (
    user_id,
    email_enabled,
    sms_enabled,
    phone_number,
    line_enabled,
    weekday,
    hour,
    minute,
    timezone,
    delivery_channel,
    is_active
  ) values (
    auth.uid(),
    true,
    false,
    null,
    false,
    (first_schedule ->> 'weekday')::integer,
    (first_schedule ->> 'hour')::integer,
    coalesce((first_schedule ->> 'minute')::integer, 0),
    'Asia/Tokyo',
    'email',
    true
  )
  on conflict (user_id) do update set
    email_enabled = true,
    weekday = excluded.weekday,
    hour = excluded.hour,
    minute = excluded.minute,
    timezone = excluded.timezone,
    delivery_channel = selected_channel,
    is_active = true;

  return query
  select ns.id, ns.weekday, ns.hour, ns.minute, ns.delivery_channel, ns.enabled, ns.sort_order
  from public.notification_schedules ns
  where ns.user_id = auth.uid() and ns.enabled = true
  order by ns.sort_order, ns.weekday;
end;
$$;

create or replace function public.save_own_sms_delivery_setting(input_enabled boolean)
returns table (
  user_id uuid,
  email_enabled boolean,
  sms_enabled boolean,
  phone_number text,
  phone_verified_at timestamptz,
  delivery_channel text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  selected_channel text := case when coalesce(input_enabled, false) then 'both' else 'email' end;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if coalesce(input_enabled, false) and not exists (
    select 1
    from public.notification_preferences np
    where np.user_id = auth.uid()
      and np.phone_verified_at is not null
      and nullif(btrim(np.phone_number), '') is not null
  ) then
    raise exception 'A verified phone number is required';
  end if;

  update public.notification_preferences np
  set
    email_enabled = true,
    sms_enabled = coalesce(input_enabled, false),
    line_enabled = false,
    sms_consent_at = case
      when coalesce(input_enabled, false) then coalesce(np.sms_consent_at, now())
      else np.sms_consent_at
    end,
    delivery_channel = selected_channel,
    is_active = true
  where np.user_id = auth.uid();

  if not found then
    raise exception 'Notification preferences are not configured';
  end if;

  update public.notification_schedules ns
  set delivery_channel = selected_channel, updated_at = now()
  where ns.user_id = auth.uid() and ns.enabled = true;

  return query
  select
    np.user_id,
    np.email_enabled,
    np.sms_enabled,
    np.phone_number,
    np.phone_verified_at,
    np.delivery_channel
  from public.notification_preferences np
  where np.user_id = auth.uid();
end;
$$;

revoke all on function public.save_own_notification_schedules(jsonb) from public;
revoke all on function public.save_own_sms_delivery_setting(boolean) from public;
grant execute on function public.save_own_notification_schedules(jsonb) to authenticated;
grant execute on function public.save_own_sms_delivery_setting(boolean) to authenticated;

commit;
