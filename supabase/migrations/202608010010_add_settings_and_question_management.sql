begin;

create or replace function public.list_owned_project_supporters(
  input_book_project_id uuid
)
returns table (
  invite_id uuid,
  supporter_id uuid,
  invitee_email text,
  display_name text,
  relationship_status text,
  email_delivery_status text,
  requested_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.book_projects bp
    where bp.id = input_book_project_id
      and bp.owner_user_id = auth.uid()
  ) then
    raise exception 'Project owner access is required';
  end if;

  return query
  with latest_invites as (
    select distinct on (lower(btrim(pi.invitee_email)))
      pi.*
    from public.project_invites pi
    where pi.book_project_id = input_book_project_id
      and pi.role = 'supporter'
    order by lower(btrim(pi.invitee_email)), pi.created_at desc
  )
  select
    pi.id,
    ps.id,
    pi.invitee_email,
    coalesce(person.preferred_name, person.display_name, pi.invitee_email),
    case
      when ps.status = 'active' then 'active'
      when pi.status = 'pending' then 'pending'
      else 'ended'
    end,
    coalesce(pi.email_delivery_status, 'not_sent'),
    pi.created_at,
    pi.accepted_at
  from latest_invites pi
  left join public.project_supporters ps
    on ps.book_project_id = pi.book_project_id
    and nullif(ps.meta_json ->> 'invite_id', '') = pi.id::text
  left join public.persons person
    on person.id = ps.supporter_person_id
  order by pi.created_at desc;
end;
$$;


create or replace function public.end_project_supporter(
  input_book_project_id uuid,
  input_supporter_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_supporter_user_id uuid;
begin
  if not exists (
    select 1 from public.book_projects bp
    where bp.id = input_book_project_id
      and bp.owner_user_id = auth.uid()
  ) then
    raise exception 'Project owner access is required';
  end if;

  update public.project_supporters ps
  set
    status = 'revoked',
    revoked_at = now(),
    updated_at = now()
  where ps.id = input_supporter_id
    and ps.book_project_id = input_book_project_id
  returning ps.supporter_user_id into target_supporter_user_id;

  if target_supporter_user_id is null then
    raise exception 'Supporter was not found';
  end if;

  update public.story_share_recipients recipient
  set
    status = 'revoked',
    updated_at = now()
  from public.story_sharing_preferences pref
  where recipient.sharing_preference_id = pref.id
    and pref.book_project_id = input_book_project_id
    and recipient.recipient_user_id = target_supporter_user_id
    and recipient.source = 'supporter';

  return true;
end;
$$;


create or replace function public.cancel_supporter_invite(
  input_book_project_id uuid,
  input_invite_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.book_projects bp
    where bp.id = input_book_project_id
      and bp.owner_user_id = auth.uid()
  ) then
    raise exception 'Project owner access is required';
  end if;

  update public.project_invites
  set status = 'declined'
  where id = input_invite_id
    and book_project_id = input_book_project_id
    and role = 'supporter'
    and status = 'pending';

  return found;
end;
$$;


create or replace function public.add_custom_story_question(
  input_book_project_id uuid,
  input_question_text text,
  input_chapter_title text,
  input_position text default 'end'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_project public.book_projects%rowtype;
  target_participant_id uuid;
  new_question_id text := 'CUSTOM_' || replace(gen_random_uuid()::text, '-', '');
  new_user_question_id uuid := gen_random_uuid();
  insert_sequence integer;
begin
  select * into target_project
  from public.book_projects bp
  where bp.id = input_book_project_id
    and bp.owner_user_id = auth.uid()
    and bp.status = 'active';

  if target_project.id is null then
    raise exception 'Project owner access is required';
  end if;

  if char_length(btrim(coalesce(input_question_text, ''))) < 4 then
    raise exception 'Question text is too short';
  end if;

  select pp.id into target_participant_id
  from public.project_participants pp
  where pp.book_project_id = input_book_project_id
    and pp.role = 'speaker'
  order by pp.created_at asc
  limit 1;

  if input_position = 'next' then
    select coalesce(min(uq.sequence_order), 1) into insert_sequence
    from public.user_questions uq
    where uq.book_project_id = input_book_project_id
      and uq.is_active = true
      and uq.status = 'pending'
      and coalesce(uq.meta_json ->> 'flow_type', '') = 'story';

    update public.user_questions
    set sequence_order = sequence_order + 1
    where book_project_id = input_book_project_id
      and sequence_order >= insert_sequence;
  else
    select coalesce(max(uq.sequence_order), 0) + 1 into insert_sequence
    from public.user_questions uq
    where uq.book_project_id = input_book_project_id;
  end if;

  insert into public.questions (
    id,
    sequence_order,
    chapter,
    content,
    is_active,
    meta_json
  ) values (
    new_question_id,
    insert_sequence,
    coalesce(nullif(btrim(input_chapter_title), ''), '追加した問い'),
    btrim(input_question_text),
    true,
    jsonb_build_object(
      'product_brand', 'tateito_yokoito',
      'flow_type', 'story',
      'question_role', 'custom_story',
      'created_by_user_id', auth.uid()
    )
  );

  insert into public.user_questions (
    id,
    user_id,
    book_project_id,
    participant_id,
    question_id,
    sequence_order,
    chapter,
    chapter_title_snapshot,
    chapter_subtitle_snapshot,
    question_text_snapshot,
    custom_question_text,
    status,
    is_active,
    meta_json
  ) values (
    new_user_question_id,
    target_project.owner_user_id,
    target_project.id,
    target_participant_id,
    new_question_id,
    insert_sequence,
    coalesce(nullif(btrim(input_chapter_title), ''), '追加した問い'),
    coalesce(nullif(btrim(input_chapter_title), ''), '追加した問い'),
    'ご自身で追加した問い',
    btrim(input_question_text),
    btrim(input_question_text),
    'pending',
    true,
    jsonb_build_object(
      'flow_type', 'story',
      'question_role', 'custom_story',
      'is_custom', true,
      'prompt_style', 'open',
      'reassurance_text', '思い浮かぶところから、お話しください。',
      'min_duration_seconds', 25,
      'min_transcript_chars', 80
    )
  );

  return new_user_question_id;
end;
$$;


revoke all on function public.list_owned_project_supporters(uuid) from public;
revoke all on function public.end_project_supporter(uuid, uuid) from public;
revoke all on function public.cancel_supporter_invite(uuid, uuid) from public;
revoke all on function public.add_custom_story_question(uuid, text, text, text) from public;

grant execute on function public.list_owned_project_supporters(uuid) to authenticated;
grant execute on function public.end_project_supporter(uuid, uuid) to authenticated;
grant execute on function public.cancel_supporter_invite(uuid, uuid) to authenticated;
grant execute on function public.add_custom_story_question(uuid, text, text, text) to authenticated;

commit;
