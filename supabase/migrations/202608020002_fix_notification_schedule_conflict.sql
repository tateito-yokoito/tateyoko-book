begin;

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
    'email',
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
    email_enabled = excluded.email_enabled,
    sms_enabled = excluded.sms_enabled,
    phone_number = excluded.phone_number,
    line_enabled = excluded.line_enabled,
    weekday = excluded.weekday,
    hour = excluded.hour,
    minute = excluded.minute,
    timezone = excluded.timezone,
    delivery_channel = excluded.delivery_channel,
    is_active = excluded.is_active;

  return query
  select ns.id, ns.weekday, ns.hour, ns.minute, ns.delivery_channel, ns.enabled, ns.sort_order
  from public.notification_schedules ns
  where ns.user_id = auth.uid() and ns.enabled = true
  order by ns.sort_order, ns.weekday;
end;
$$;

grant execute on function public.save_own_notification_schedules(jsonb) to authenticated;

commit;
