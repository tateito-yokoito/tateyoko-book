begin;

alter table public.family_memberships drop constraint if exists family_memberships_status_check;
alter table public.family_memberships add constraint family_memberships_status_check
  check (status in ('active', 'paused', 'revoked'));

alter table public.story_relationship_invites drop constraint if exists story_relationship_invites_status_check;
alter table public.story_relationship_invites add constraint story_relationship_invites_status_check
  check (status in ('pending', 'accepted', 'paused', 'declined', 'revoked'));

drop index if exists public.story_relationship_invites_active_unique;
create unique index story_relationship_invites_active_unique
  on public.story_relationship_invites (book_project_id, lower(btrim(invitee_email)), invite_type)
  where status in ('pending', 'accepted', 'paused');

create or replace function public.set_story_relationship_paused(
  input_book_project_id uuid,
  input_relationship_id uuid,
  input_paused boolean
)
returns boolean language plpgsql security definer set search_path = public, auth
as $$
declare target public.story_relationship_invites%rowtype;
begin
  if not exists (select 1 from public.book_projects bp where bp.id = input_book_project_id and bp.owner_user_id = auth.uid())
  then raise exception 'Project owner access is required'; end if;
  select * into target from public.story_relationship_invites
    where id = input_relationship_id and book_project_id = input_book_project_id and status in ('accepted','paused');
  if target.id is null then return false; end if;

  update public.story_relationship_invites set status = case when input_paused then 'paused' else 'accepted' end, updated_at = now()
    where id = target.id;
  update public.story_share_recipients r set status = case when input_paused then 'revoked' else 'active' end, updated_at = now()
  from public.story_sharing_preferences pref where pref.id = r.sharing_preference_id
    and pref.book_project_id = input_book_project_id and r.recipient_user_id = target.recipient_user_id and r.source = target.invite_type;
  if target.invite_type = 'family' and target.recipient_user_id is not null then
    update public.family_memberships fm set status = case when input_paused then 'paused' else 'active' end, updated_at = now()
    from public.book_projects bp where bp.id = input_book_project_id and fm.family_id = bp.family_id and fm.user_id = target.recipient_user_id;
  end if;
  return true;
end;
$$;

revoke all on function public.set_story_relationship_paused(uuid,uuid,boolean) from public;
grant execute on function public.set_story_relationship_paused(uuid,uuid,boolean) to authenticated;

commit;
