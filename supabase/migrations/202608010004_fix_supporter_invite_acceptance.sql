begin;

-- RETURNS TABLE の book_project_id と列名が衝突しないよう、
-- サポーターの upsert は制約名を明示する。
create or replace function public.respond_to_supporter_invite(
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
  current_person_id uuid;
  target_invite public.project_invites%rowtype;
  target_project public.book_projects%rowtype;
  target_sharing_preference_id uuid;
begin
  if current_user_id is null or current_email = '' then
    raise exception 'Authentication is required';
  end if;

  select pi.*
    into target_invite
  from public.project_invites pi
  where pi.id = input_invite_id
    and pi.role = 'supporter'
    and pi.status = 'pending'
    and lower(btrim(pi.invitee_email)) = current_email
  for update;

  if not found then
    raise exception 'The invitation was not found or is not available';
  end if;

  select bp.*
    into target_project
  from public.book_projects bp
  where bp.id = target_invite.book_project_id
    and bp.status = 'active';

  if not found then
    raise exception 'The story project is not available';
  end if;

  if input_accept is not true then
    update public.project_invites
    set
      status = 'declined',
      accepted_at = null
    where id = target_invite.id;

    return query
    select target_invite.id, target_invite.book_project_id, 'declined'::text;
    return;
  end if;

  select upl.person_id
    into current_person_id
  from public.user_person_links upl
  where upl.user_id = current_user_id
    and upl.role = 'self'
  order by upl.created_at asc
  limit 1;

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
    revoked_at,
    meta_json
  ) values (
    target_invite.book_project_id,
    current_user_id,
    current_person_id,
    target_invite.inviter_user_id,
    'active',
    true,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    null,
    jsonb_build_object('source', 'project_invite', 'invite_id', target_invite.id)
  )
  on conflict on constraint project_supporters_project_user_unique
  do update set
    supporter_person_id = excluded.supporter_person_id,
    granted_by_user_id = excluded.granted_by_user_id,
    status = 'active',
    can_operate_recording = true,
    can_manage_photos = true,
    can_edit_book_text = true,
    can_build_book = true,
    can_view_raw_audio = false,
    can_change_sharing = false,
    can_change_legacy = false,
    can_delete_story = false,
    revoked_at = null,
    meta_json = project_supporters.meta_json || excluded.meta_json,
    updated_at = now();

  if target_invite.auto_share_on_accept then
    insert into public.story_sharing_preferences (
      book_project_id,
      owner_person_id,
      live_scope
    ) values (
      target_project.id,
      target_project.subject_person_id,
      'selected'
    )
    on conflict on constraint story_sharing_preferences_project_unique
    do nothing;

    update public.story_sharing_preferences
    set live_scope = 'selected'
    where story_sharing_preferences.book_project_id = target_project.id
      and live_scope = 'private';

    select pref.id
      into target_sharing_preference_id
    from public.story_sharing_preferences pref
    where pref.book_project_id = target_project.id;

    insert into public.story_share_recipients (
      sharing_preference_id,
      recipient_person_id,
      recipient_user_id,
      recipient_phase,
      source,
      status,
      meta_json
    ) values (
      target_sharing_preference_id,
      current_person_id,
      current_user_id,
      'live',
      'supporter',
      'active',
      jsonb_build_object('invite_id', target_invite.id)
    )
    on conflict do nothing;

    update public.story_share_recipients
    set
      recipient_person_id = coalesce(recipient_person_id, current_person_id),
      recipient_user_id = current_user_id,
      source = 'supporter',
      status = 'active',
      updated_at = now()
    where story_share_recipients.sharing_preference_id =
      target_sharing_preference_id
      and recipient_phase = 'live'
      and (
        recipient_user_id = current_user_id
        or (
          current_person_id is not null
          and recipient_person_id = current_person_id
        )
      );
  end if;

  update public.project_invites
  set
    status = 'accepted',
    accepted_at = now()
  where id = target_invite.id;

  return query
  select target_invite.id, target_invite.book_project_id, 'accepted'::text;
end;
$$;

revoke all on function public.respond_to_supporter_invite(uuid, boolean)
  from public;

grant execute on function public.respond_to_supporter_invite(uuid, boolean)
  to authenticated;

commit;
