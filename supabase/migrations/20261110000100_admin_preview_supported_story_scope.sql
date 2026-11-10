-- Match the target supporter's story visibility in the read-only admin preview.
-- This function never grants the target supporter new access.
create or replace function public.admin_preview_supporter_story_ids(
  input_project_id uuid,
  input_supporter_user_id uuid
)
returns table (answer_id uuid)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  support_role text;
  can_read_stories boolean;
begin
  if auth.uid() is null or public.is_tateyoko_admin() is distinct from true then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select coalesce(ps.meta_json ->> 'support_role', 'helper'),
         ps.can_edit_book_text or ps.can_build_book
    into support_role, can_read_stories
  from public.project_supporters ps
  join public.book_projects bp on bp.id = ps.book_project_id
  where ps.book_project_id = input_project_id
    and ps.supporter_user_id = input_supporter_user_id
    and ps.status = 'active'
    and bp.status = 'active'
    and public.admin_readonly_customer_project(input_supporter_user_id, bp.id)
  limit 1;

  if not found then
    raise exception 'Target account cannot open supported project' using errcode = '42501';
  end if;

  if support_role in ('facilitator', 'co_manager') then
    return query
      select a.id from public.answers a
      where a.book_project_id = input_project_id;
    return;
  end if;

  if coalesce(can_read_stories, false) and exists (
    select 1 from public.story_sharing_preferences pref
    where pref.book_project_id = input_project_id
      and (
        pref.live_scope = 'family'
        or (pref.live_scope = 'selected' and exists (
          select 1 from public.story_share_recipients recipient
          where recipient.sharing_preference_id = pref.id
            and recipient.recipient_user_id = input_supporter_user_id
            and recipient.status = 'active'
            and recipient.recipient_phase in ('live', 'both')
        ))
      )
  ) then
    return query
      select a.id from public.answers a
      where a.book_project_id = input_project_id
        and coalesce(a.access_override, 'inherit') <> 'private_forever';
  end if;
end;
$$;

revoke all on function public.admin_preview_supporter_story_ids(uuid, uuid) from public, anon;
grant execute on function public.admin_preview_supporter_story_ids(uuid, uuid) to authenticated;
