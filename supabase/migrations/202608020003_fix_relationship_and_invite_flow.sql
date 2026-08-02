begin;

-- 「選んだ人」の共有元を正規の値として扱う。
alter table public.story_share_recipients
  drop constraint if exists story_share_recipients_source_check;
alter table public.story_share_recipients
  add constraint story_share_recipients_source_check
  check (source in ('direct', 'selected', 'supporter', 'family'));

-- 招待時に入力した正式氏名を優先し、承認後に「あなた」と表示されないようにする。
create or replace function public.list_owned_story_relationships(input_book_project_id uuid)
returns table (
  relationship_id uuid,
  invite_type text,
  invitee_email text,
  display_name text,
  relationship_label text,
  relationship_status text,
  email_delivery_status text,
  is_supporter boolean,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.book_projects bp
    where bp.id = input_book_project_id and bp.owner_user_id = auth.uid()
  ) then
    raise exception 'Project owner access is required';
  end if;

  return query
  select
    i.id,
    i.invite_type,
    i.invitee_email,
    coalesce(
      nullif(btrim(i.invitee_name), ''),
      nullif(btrim(concat_ws(' ', p.family_name, p.given_name)), ''),
      nullif(p.display_name, 'あなた'),
      i.invitee_email
    ),
    i.relationship_label,
    i.status,
    i.email_delivery_status,
    exists (
      select 1 from public.project_supporters ps
      where ps.book_project_id = i.book_project_id
        and ps.supporter_user_id = i.recipient_user_id
        and ps.status = 'active'
    ),
    i.created_at
  from public.story_relationship_invites i
  left join public.persons p on p.id = i.recipient_person_id
  where i.book_project_id = input_book_project_id
    and i.status <> 'revoked'
  order by i.created_at desc;
end;
$$;

-- 承諾後の遷移先を特定できるようプロジェクトIDも返す。
drop function if exists public.list_pending_story_relationship_invites();
create function public.list_pending_story_relationship_invites()
returns table (
  invite_id uuid,
  book_project_id uuid,
  invite_type text,
  project_title text,
  owner_name text,
  relationship_label text,
  invitee_email text
)
language sql stable security definer set search_path = public, auth
as $$
  select
    i.id,
    i.book_project_id,
    i.invite_type,
    bp.title,
    coalesce(p.preferred_name, p.display_name, 'ご家族'),
    i.relationship_label,
    i.invitee_email
  from public.story_relationship_invites i
  join public.book_projects bp on bp.id = i.book_project_id and bp.status = 'active'
  left join public.persons p on p.id = bp.subject_person_id
  where i.status = 'pending'
    and lower(btrim(i.invitee_email)) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  order by i.created_at asc;
$$;

-- PostgRESTの応答がタイムアウトした後に同じ操作を送っても、
-- 保存済みの承諾結果を返せる薄いラッパー。
create or replace function public.respond_to_supporter_invite_resilient(
  input_invite_id uuid,
  input_accept boolean
)
returns table (
  invite_id uuid,
  book_project_id uuid,
  response_status text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  target_invite public.project_invites%rowtype;
begin
  if current_user_id is null or current_email = '' then
    raise exception 'Authentication is required';
  end if;

  select pi.* into target_invite
  from public.project_invites pi
  where pi.id = input_invite_id
    and pi.role = 'supporter'
    and lower(btrim(pi.invitee_email)) = current_email;

  if target_invite.id is null then
    raise exception 'The invitation was not found or is not available';
  end if;

  if target_invite.status = 'accepted' and input_accept is true and exists (
    select 1 from public.project_supporters ps
    where ps.book_project_id = target_invite.book_project_id
      and ps.supporter_user_id = current_user_id
      and ps.status = 'active'
  ) then
    return query
    select target_invite.id, target_invite.book_project_id, 'accepted'::text;
    return;
  end if;

  if target_invite.status = 'declined' and input_accept is false then
    return query
    select target_invite.id, target_invite.book_project_id, 'declined'::text;
    return;
  end if;

  if target_invite.status <> 'pending' then
    raise exception 'The invitation was already answered';
  end if;

  return query
  select response.invite_id, response.book_project_id, response.response_status
  from public.respond_to_supporter_invite(input_invite_id, input_accept) response;
end;
$$;

-- 共有相手はサポーター権限とは別に、読み取り専用で物語を受け取る。
create or replace function public.shared_story_recipient_can_view(input_book_project_id uuid)
returns boolean language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1
    from public.story_sharing_preferences pref
    join public.story_share_recipients r on r.sharing_preference_id = pref.id
    where pref.book_project_id = input_book_project_id
      and r.recipient_user_id = auth.uid()
      and r.status = 'active'
      and r.recipient_phase in ('live', 'both')
      and (
        (r.source = 'family' and pref.family_sharing_enabled) or
        (r.source in ('direct', 'selected', 'supporter') and pref.selected_sharing_enabled)
      )
  ) or exists (
    select 1
    from public.book_projects bp
    join public.story_sharing_preferences pref on pref.book_project_id = bp.id
    join public.family_memberships fm on fm.family_id = bp.family_id
    where bp.id = input_book_project_id
      and pref.family_sharing_enabled
      and fm.user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

create or replace function public.list_received_story_projects()
returns table (
  book_project_id uuid,
  project_title text,
  subject_person_id uuid,
  subject_name text,
  invite_type text,
  relationship_label text
)
language sql stable security definer set search_path = public, auth
as $$
  select distinct on (bp.id)
    bp.id,
    bp.title,
    bp.subject_person_id,
    coalesce(p.preferred_name, p.display_name, 'ご家族'),
    i.invite_type,
    i.relationship_label
  from public.book_projects bp
  join public.story_relationship_invites i
    on i.book_project_id = bp.id
   and i.recipient_user_id = auth.uid()
   and i.status in ('accepted', 'paused')
  left join public.persons p on p.id = bp.subject_person_id
  where bp.status = 'active'
    and i.status = 'accepted'
    and public.shared_story_recipient_can_view(bp.id)
  order by bp.id, i.accepted_at desc nulls last;
$$;

create or replace function public.get_received_story_stories(input_book_project_id uuid)
returns table (
  answer_id uuid,
  sequence_order integer,
  book_text text,
  created_at timestamptz,
  question_text text,
  chapter_title text
)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.shared_story_recipient_can_view(input_book_project_id) then
    raise exception 'Shared story access is not allowed';
  end if;

  return query
  select
    a.id,
    a.sequence_order,
    coalesce(
      nullif(a.transcript_edited, ''),
      case when a.selected_style = 'essay' then nullif(a.transcript_essay, '') else nullif(a.transcript_readable, '') end,
      nullif(a.transcript_readable, ''),
      nullif(a.transcript_clean, ''),
      ''
    ),
    a.created_at,
    coalesce(uq.custom_question_text, uq.question_text_snapshot, '残された語り'),
    coalesce(uq.chapter_title_snapshot, uq.chapter, '物語')
  from public.answers a
  left join public.user_questions uq on uq.id = a.user_question_id
  where a.book_project_id = input_book_project_id
    and coalesce(a.access_override, 'inherit') <> 'private_forever'
  order by a.sequence_order asc;
end;
$$;

revoke all on function public.list_owned_story_relationships(uuid) from public;
revoke all on function public.list_pending_story_relationship_invites() from public;
revoke all on function public.respond_to_supporter_invite_resilient(uuid, boolean) from public;
revoke all on function public.shared_story_recipient_can_view(uuid) from public;
revoke all on function public.list_received_story_projects() from public;
revoke all on function public.get_received_story_stories(uuid) from public;

grant execute on function public.list_owned_story_relationships(uuid) to authenticated;
grant execute on function public.list_pending_story_relationship_invites() to authenticated;
grant execute on function public.respond_to_supporter_invite_resilient(uuid, boolean) to authenticated;
grant execute on function public.shared_story_recipient_can_view(uuid) to authenticated;
grant execute on function public.list_received_story_projects() to authenticated;
grant execute on function public.get_received_story_stories(uuid) to authenticated;

commit;
