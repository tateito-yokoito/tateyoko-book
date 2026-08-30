begin;

-- Delivery times belong to a story, not only to an account. This keeps an
-- account's own story and a parent story from competing for the same slot.
alter table public.notification_schedules
  add column if not exists book_project_id uuid
  references public.book_projects(id)
  on delete cascade;

update public.notification_schedules ns
set book_project_id = (
  select bp.id
  from public.book_projects bp
  left join public.user_person_links self_link
    on self_link.person_id = bp.subject_person_id
   and self_link.user_id = ns.user_id
   and self_link.role = 'self'
  where bp.owner_user_id = ns.user_id
    and bp.status = 'active'
  order by
    case when self_link.id is not null then 0 else 1 end,
    bp.created_at,
    bp.id
  limit 1
)
where ns.book_project_id is null;

alter table public.notification_schedules
  drop constraint if exists notification_schedules_user_slot_unique;

alter table public.notification_schedules
  drop constraint if exists notification_schedules_user_project_slot_unique;

alter table public.notification_schedules
  add constraint notification_schedules_user_project_slot_unique
  unique (user_id, book_project_id, weekday, hour, minute);

create index if not exists idx_notification_schedules_project
  on public.notification_schedules(book_project_id, enabled);

create or replace function public.save_project_notification_schedules(
  input_book_project_id uuid,
  input_schedules jsonb
)
returns table (
  id uuid,
  weekday integer,
  hour integer,
  minute integer,
  delivery_channel text,
  enabled boolean,
  sort_order smallint,
  book_project_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  schedule_count integer;
  duplicate_slots integer;
  first_schedule jsonb;
  selected_channel text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if input_book_project_id is null or not exists (
    select 1
    from public.book_projects bp
    left join public.project_supporters ps
      on ps.book_project_id = bp.id
     and ps.supporter_user_id = auth.uid()
     and ps.status = 'active'
    where bp.id = input_book_project_id
      and bp.status = 'active'
      and (
        bp.owner_user_id = auth.uid()
        or coalesce(ps.meta_json ->> 'support_role', '') = 'facilitator'
      )
  ) then
    raise exception 'Story access is not allowed';
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

  select count(*) - count(distinct format(
    '%s:%s:%s',
    (item ->> 'weekday')::integer,
    (item ->> 'hour')::integer,
    coalesce((item ->> 'minute')::integer, 0)
  ))
  into duplicate_slots
  from jsonb_array_elements(input_schedules) item;

  if duplicate_slots > 0 then
    raise exception 'The same schedule cannot be registered more than once';
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
  where ns.user_id = auth.uid()
    and ns.book_project_id = input_book_project_id;

  update public.book_projects bp
  set
    onboarding_preferences = coalesce(bp.onboarding_preferences, '{}'::jsonb)
      || jsonb_build_object('notification_recipient', 'facilitator'),
    updated_at = now()
  where bp.id = input_book_project_id;

  update public.project_supporters ps
  set
    meta_json = coalesce(ps.meta_json, '{}'::jsonb)
      || jsonb_build_object('notification_recipient', 'facilitator'),
    updated_at = now()
  where ps.book_project_id = input_book_project_id
    and ps.supporter_user_id = auth.uid()
    and ps.status = 'active';

  insert into public.notification_schedules (
    user_id,
    book_project_id,
    weekday,
    hour,
    minute,
    delivery_channel,
    enabled,
    sort_order
  )
  select
    auth.uid(),
    input_book_project_id,
    (item ->> 'weekday')::integer,
    (item ->> 'hour')::integer,
    coalesce((item ->> 'minute')::integer, 0),
    selected_channel,
    true,
    ordinality::smallint
  from jsonb_array_elements(input_schedules)
    with ordinality as schedules(item, ordinality)
  on conflict on constraint notification_schedules_user_project_slot_unique
  do update set
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
  select
    ns.id,
    ns.weekday,
    ns.hour,
    ns.minute,
    ns.delivery_channel,
    ns.enabled,
    ns.sort_order,
    ns.book_project_id
  from public.notification_schedules ns
  where ns.user_id = auth.uid()
    and ns.book_project_id = input_book_project_id
    and ns.enabled = true
  order by ns.sort_order, ns.weekday, ns.hour, ns.minute;
end;
$$;

revoke all on function public.save_project_notification_schedules(uuid, jsonb) from public;
grant execute on function public.save_project_notification_schedules(uuid, jsonb) to authenticated;

create or replace function public.set_family_story_delivery_mode(
  input_book_project_id uuid,
  input_mode text
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if input_mode not in ('manual', 'facilitator') then
    raise exception 'Unsupported delivery mode';
  end if;

  if not exists (
    select 1
    from public.book_projects bp
    join public.project_supporters ps
      on ps.book_project_id = bp.id
     and ps.supporter_user_id = auth.uid()
     and ps.status = 'active'
    where bp.id = input_book_project_id
      and bp.owner_user_id = auth.uid()
      and bp.status = 'active'
      and coalesce(bp.onboarding_preferences ->> 'support_mode', '') = 'child_led'
  ) then
    raise exception 'Family story access is not allowed';
  end if;

  update public.book_projects bp
  set
    onboarding_preferences = coalesce(bp.onboarding_preferences, '{}'::jsonb)
      || jsonb_build_object('notification_recipient', input_mode),
    updated_at = now()
  where bp.id = input_book_project_id;

  update public.project_supporters ps
  set
    meta_json = coalesce(ps.meta_json, '{}'::jsonb)
      || jsonb_build_object('notification_recipient', input_mode),
    updated_at = now()
  where ps.book_project_id = input_book_project_id
    and ps.supporter_user_id = auth.uid()
    and ps.status = 'active';

  if input_mode = 'manual' then
    update public.notification_schedules ns
    set enabled = false, updated_at = now()
    where ns.user_id = auth.uid()
      and ns.book_project_id = input_book_project_id;
  end if;

  return input_mode;
end;
$$;

revoke all on function public.set_family_story_delivery_mode(uuid, text) from public;
grant execute on function public.set_family_story_delivery_mode(uuid, text) to authenticated;

-- Keep the existing API working, while making its rows project-specific.
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
  own_project_id uuid;
begin
  select bp.id
  into own_project_id
  from public.book_projects bp
  join public.user_person_links self_link
    on self_link.person_id = bp.subject_person_id
   and self_link.user_id = auth.uid()
   and self_link.role = 'self'
  where bp.owner_user_id = auth.uid()
    and bp.status = 'active'
  order by bp.created_at, bp.id
  limit 1;

  if own_project_id is null then
    raise exception 'Your story was not found';
  end if;

  return query
  select
    saved.id,
    saved.weekday,
    saved.hour,
    saved.minute,
    saved.delivery_channel,
    saved.enabled,
    saved.sort_order
  from public.save_project_notification_schedules(
    own_project_id,
    input_schedules
  ) saved;
end;
$$;

revoke all on function public.save_own_notification_schedules(jsonb) from public;
grant execute on function public.save_own_notification_schedules(jsonb) to authenticated;

create or replace function public.create_child_led_family_story(
  input_subject_name text,
  input_relationship_label text default 'parent',
  input_creation_key uuid default gen_random_uuid()
)
returns table (
  book_project_id uuid,
  subject_person_id uuid,
  subject_name text,
  supporter_id uuid,
  project_title text,
  created boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_name text := nullif(btrim(input_subject_name), '');
  target_family public.families%rowtype;
  facilitator_person_id uuid;
  target_person public.persons%rowtype;
  target_project public.book_projects%rowtype;
  question_set public.question_sets%rowtype;
  speaker_participant_id uuid;
  target_supporter_id uuid;
  existing_project_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if normalized_name is null or char_length(normalized_name) > 80 then
    raise exception 'A subject name between 1 and 80 characters is required';
  end if;

  if coalesce(input_relationship_label, '') not in (
    'parent', 'spouse', 'sibling', 'grandparent', 'child', 'other'
  ) then
    raise exception 'Unsupported relationship';
  end if;

  select bp.id
  into existing_project_id
  from public.book_projects bp
  where bp.owner_user_id = current_user_id
    and bp.status = 'active'
    and bp.onboarding_preferences ->> 'creation_key' = input_creation_key::text
  limit 1;

  if existing_project_id is not null then
    return query
    select
      bp.id,
      bp.subject_person_id,
      coalesce(p.preferred_name, p.display_name),
      ps.id,
      bp.title,
      false
    from public.book_projects bp
    join public.persons p on p.id = bp.subject_person_id
    join public.project_supporters ps
      on ps.book_project_id = bp.id
     and ps.supporter_user_id = current_user_id
     and ps.status = 'active'
    where bp.id = existing_project_id;
    return;
  end if;

  select f.*
  into target_family
  from public.families f
  where f.owner_user_id = current_user_id
  order by f.created_at, f.id
  limit 1;

  if target_family.id is null then
    insert into public.families (owner_user_id, name)
    values (current_user_id, '家族の物語')
    returning * into target_family;
  end if;

  select upl.person_id
  into facilitator_person_id
  from public.user_person_links upl
  where upl.user_id = current_user_id
    and upl.role = 'self'
  order by upl.created_at, upl.id
  limit 1;

  if facilitator_person_id is null then
    raise exception 'Your profile person was not found';
  end if;

  select qs.*
  into question_set
  from public.question_sets qs
  where qs.code = 'tateito_yokoito_standard_v2'
    and qs.is_active = true
  order by qs.version desc nulls last, qs.created_at desc
  limit 1;

  if question_set.id is null then
    raise exception 'The question set was not found';
  end if;

  insert into public.persons (
    family_id,
    display_name,
    preferred_name,
    notes
  ) values (
    target_family.id,
    normalized_name,
    normalized_name,
    format('進行役との関係: %s', input_relationship_label)
  )
  returning * into target_person;

  insert into public.book_projects (
    family_id,
    owner_user_id,
    subject_person_id,
    purchaser_user_id,
    project_type,
    title,
    status,
    base_question_set_id,
    onboarding_status,
    onboarding_preferences
  ) values (
    target_family.id,
    current_user_id,
    target_person.id,
    current_user_id,
    'koebook',
    normalized_name || 'さんの縦糸横糸',
    'active',
    question_set.id,
    'in_progress',
    jsonb_build_object(
      'creation_key', input_creation_key,
      'story_subject_mode', 'family',
      'support_mode', 'child_led',
      'notification_recipient', 'manual',
      'relationship_label', input_relationship_label
    )
  )
  returning * into target_project;

  insert into public.project_participants (
    book_project_id,
    user_id,
    person_id,
    role,
    invite_status
  ) values (
    target_project.id,
    current_user_id,
    facilitator_person_id,
    'owner',
    'active'
  );

  insert into public.project_participants (
    book_project_id,
    user_id,
    person_id,
    role,
    invite_status
  ) values (
    target_project.id,
    null,
    target_person.id,
    'subject',
    'active'
  );

  insert into public.project_participants (
    book_project_id,
    user_id,
    person_id,
    role,
    invite_status
  ) values (
    target_project.id,
    null,
    target_person.id,
    'speaker',
    'active'
  )
  returning id into speaker_participant_id;

  insert into public.project_supporters (
    book_project_id,
    supporter_user_id,
    supporter_person_id,
    granted_by_user_id,
    status,
    can_operate_recording,
    can_manage_photos,
    can_edit_book_text,
    can_build_book,
    can_view_raw_audio,
    can_change_sharing,
    can_change_legacy,
    can_delete_story,
    meta_json
  ) values (
    target_project.id,
    current_user_id,
    facilitator_person_id,
    current_user_id,
    'active',
    true,
    true,
    true,
    true,
    true,
    true,
    false,
    false,
    jsonb_build_object(
      'support_role', 'facilitator',
      'support_mode', 'child_led',
      'notification_recipient', 'manual'
    )
  )
  returning id into target_supporter_id;

  insert into public.user_questions (
    user_id,
    book_project_id,
    participant_id,
    question_id,
    sequence_order,
    chapter,
    chapter_title_snapshot,
    chapter_subtitle_snapshot,
    question_text_snapshot,
    status,
    is_active,
    meta_json
  )
  select
    current_user_id,
    target_project.id,
    speaker_participant_id,
    qsi.question_id,
    row_number() over (order by qsi.sequence_order, qsi.id)::integer,
    coalesce(qsi.chapter_title_snapshot, chapter.label, question.chapter),
    coalesce(qsi.chapter_title_snapshot, chapter.label, question.chapter),
    coalesce(qsi.chapter_subtitle_snapshot, chapter.description, question.chapter),
    coalesce(qsi.question_text_snapshot, question.content),
    'pending',
    true,
    coalesce(qsi.meta_json, '{}'::jsonb) || jsonb_build_object(
      'question_set_id', question_set.id,
      'question_set_code', question_set.code,
      'question_set_name', question_set.name,
      'question_set_version', question_set.version,
      'question_set_item_id', qsi.id,
      'original_sequence_order', qsi.sequence_order,
      'prompt_style', qsi.prompt_style,
      'prompt_hint', qsi.prompt_hint_snapshot,
      'reassurance_text', qsi.reassurance_text_snapshot,
      'followup_hint', qsi.followup_hint_snapshot,
      'min_duration_seconds', coalesce(qsi.min_duration_seconds, 25),
      'min_transcript_chars', coalesce(qsi.min_transcript_chars, 80),
      'delivery_role', 'facilitator'
    )
  from public.question_set_items qsi
  join public.questions question on question.id = qsi.question_id
  left join public.chapters chapter on chapter.id = qsi.chapter_id
  where qsi.question_set_id = question_set.id
    and qsi.is_active = true
  order by qsi.sequence_order, qsi.id;

  update public.book_projects bp
  set
    current_onboarding_user_question_id = first_question.id,
    onboarding_started_at = now(),
    updated_at = now()
  from lateral (
    select uq.id
    from public.user_questions uq
    where uq.book_project_id = target_project.id
      and uq.is_active = true
    order by uq.sequence_order, uq.id
    limit 1
  ) first_question
  where bp.id = target_project.id;

  insert into public.story_sharing_preferences (
    book_project_id,
    owner_person_id,
    live_scope,
    family_sharing_enabled,
    selected_sharing_enabled
  ) values (
    target_project.id,
    target_person.id,
    'private',
    false,
    false
  )
  on conflict (book_project_id) do nothing;

  return query
  select
    target_project.id,
    target_person.id,
    normalized_name,
    target_supporter_id,
    target_project.title,
    true;
end;
$$;

revoke all on function public.create_child_led_family_story(text, text, uuid) from public;
grant execute on function public.create_child_led_family_story(text, text, uuid) to authenticated;

drop function if exists public.list_supported_story_projects();

create function public.list_supported_story_projects()
returns table (
  supporter_id uuid,
  book_project_id uuid,
  project_title text,
  subject_person_id uuid,
  subject_name text,
  can_operate_recording boolean,
  can_manage_photos boolean,
  can_edit_book_text boolean,
  can_build_book boolean,
  owner_user_id uuid,
  support_role text,
  support_mode text,
  notification_recipient text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    ps.id,
    bp.id,
    bp.title,
    bp.subject_person_id,
    coalesce(p.preferred_name, p.display_name, '物語の持ち主'),
    ps.can_operate_recording,
    ps.can_manage_photos,
    ps.can_edit_book_text,
    ps.can_build_book,
    bp.owner_user_id,
    coalesce(ps.meta_json ->> 'support_role', 'helper'),
    coalesce(ps.meta_json ->> 'support_mode', 'person_led'),
    coalesce(ps.meta_json ->> 'notification_recipient', 'subject')
  from public.project_supporters ps
  join public.book_projects bp on bp.id = ps.book_project_id
  left join public.persons p on p.id = bp.subject_person_id
  where ps.supporter_user_id = auth.uid()
    and ps.status = 'active'
    and bp.status = 'active'
  order by ps.created_at, ps.id;
$$;

revoke all on function public.list_supported_story_projects() from public;
grant execute on function public.list_supported_story_projects() to authenticated;

drop function if exists public.get_due_question_deliveries_v2();

create function public.get_due_question_deliveries_v2()
returns table (
  notification_schedule_id uuid,
  user_id uuid,
  book_project_id uuid,
  email text,
  phone_number text,
  user_name text,
  subject_name text,
  delivery_role text,
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
  due_projects as (
    select
      ns.id as notification_schedule_id,
      ns.user_id,
      ns.book_project_id,
      profile.email,
      preference.phone_number,
      coalesce(profile.preferred_name, profile.display_name, profile.name, 'あなた') as user_name,
      coalesce(subject.preferred_name, subject.display_name, '物語の本人') as subject_name,
      case
        when bp.owner_user_id = ns.user_id
          and bp.subject_person_id <> self_link.person_id
          then 'facilitator'
        else 'subject'
      end as delivery_role,
      coalesce(preference.email_enabled, true) as email_enabled,
      coalesce(preference.sms_enabled, false) as sms_enabled,
      coalesce(ns.delivery_channel, preference.delivery_channel, 'email') as delivery_channel,
      c.scheduled_for
    from public.notification_schedules ns
    join public.notification_preferences preference on preference.user_id = ns.user_id
    join public.profiles profile on profile.id = ns.user_id
    join public.book_projects bp on bp.id = ns.book_project_id and bp.status = 'active'
    left join public.persons subject on subject.id = bp.subject_person_id
    left join public.user_person_links self_link
      on self_link.user_id = ns.user_id
     and self_link.role = 'self'
    cross join clock c
    where ns.enabled = true
      and coalesce(preference.is_active, true) = true
      and ns.weekday = extract(dow from c.current_time)::integer
      and ns.hour = extract(hour from c.current_time)::integer
      and ns.minute = extract(minute from c.current_time)::integer
      and (
        (coalesce(preference.email_enabled, true) = true and nullif(btrim(profile.email), '') is not null)
        or
        (coalesce(preference.sms_enabled, false) = true and nullif(btrim(preference.phone_number), '') is not null)
      )
      and not exists (
        select 1
        from public.admin_retired_accounts retired
        where retired.account_id = ns.user_id
          and retired.restored_at is null
      )
  ),
  next_questions as (
    select distinct on (uq.user_id, uq.book_project_id)
      uq.user_id,
      uq.book_project_id,
      uq.id as user_question_id,
      uq.question_id::text as question_id,
      uq.sequence_order,
      coalesce(uq.custom_question_text, uq.question_text_snapshot, question.content) as question_text
    from public.user_questions uq
    join public.book_projects bp on bp.id = uq.book_project_id
    left join public.questions question on question.id = uq.question_id
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
        from public.notification_deliveries delivery
        where delivery.user_question_id = uq.id
          and delivery.status = 'sent'
      )
    order by uq.user_id, uq.book_project_id, uq.sequence_order, uq.created_at, uq.id
  )
  select
    due.notification_schedule_id,
    due.user_id,
    due.book_project_id,
    due.email,
    due.phone_number,
    due.user_name,
    due.subject_name,
    due.delivery_role,
    next_question.user_question_id,
    next_question.question_id,
    next_question.sequence_order,
    next_question.question_text,
    due.scheduled_for,
    due.email_enabled,
    due.sms_enabled,
    due.delivery_channel
  from due_projects due
  join next_questions next_question
    on next_question.user_id = due.user_id
   and next_question.book_project_id = due.book_project_id
  where next_question.question_text is not null;
$$;

revoke all on function public.get_due_question_deliveries_v2() from public, anon, authenticated;
grant execute on function public.get_due_question_deliveries_v2() to service_role;

comment on function public.get_due_question_deliveries_v2() is
  '物語ごとの配信時間から、その物語の次の問いを取得するワーカー専用関数。';

commit;
