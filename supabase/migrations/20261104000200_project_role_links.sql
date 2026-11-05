-- Reuse project_invites and project_supporters for shareable role invitations.
-- Older email invitations retain their existing acceptance path and permissions.
alter table public.project_invites alter column invitee_email drop not null;
alter table public.project_invites add column if not exists claim_token text;
alter table public.project_invites add column if not exists expires_at timestamptz;
create unique index if not exists project_invites_claim_token_unique
  on public.project_invites (claim_token) where claim_token is not null;

create or replace function public.is_project_co_manager(
  input_book_project_id uuid, input_user_id uuid default auth.uid()
) returns boolean language sql stable security definer
set search_path = public, auth as $$
  select input_user_id is not null and exists (
    select 1 from public.project_supporters ps
    join public.book_projects bp on bp.id = ps.book_project_id
    where ps.book_project_id = input_book_project_id
      and bp.status = 'active'
      and ps.supporter_user_id = input_user_id
      and ps.status = 'active'
      and ps.meta_json ->> 'support_role' = 'co_manager'
  );
$$;
revoke all on function public.is_project_co_manager(uuid, uuid) from public, anon;
grant execute on function public.is_project_co_manager(uuid, uuid) to authenticated;

create or replace function public.issue_project_role_invite(
  input_book_project_id uuid, input_role text
) returns jsonb language plpgsql security definer
set search_path = public, auth as $$
declare target_project public.book_projects%rowtype;
declare target_invite public.project_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'ログインが必要です' using errcode='42501'; end if;
  if input_role not in ('supporter', 'co_manager') then
    raise exception '招待の権限を確認できません' using errcode='22023';
  end if;
  select * into target_project from public.book_projects
    where id=input_book_project_id and status='active';
  if target_project.id is null or (target_project.owner_user_id <> auth.uid()
    and not public.is_project_co_manager(input_book_project_id)) then
    raise exception 'この物語の招待を作れません' using errcode='42501';
  end if;
  insert into public.project_invites (
    book_project_id, inviter_user_id, invitee_email, role, status,
    auto_share_on_accept, claim_token, expires_at
  ) values (
    input_book_project_id, auth.uid(), null, input_role, 'pending',
    false, encode(extensions.gen_random_bytes(32), 'hex'), now()+interval '14 days'
  ) returning * into target_invite;
  return jsonb_build_object('invite_id', target_invite.id,
    'token', target_invite.claim_token, 'role', target_invite.role,
    'expires_at', target_invite.expires_at);
end;
$$;

create or replace function public.preview_project_role_invite(input_token text)
returns jsonb language plpgsql stable security definer
set search_path = public, auth as $$
declare target_invite public.project_invites%rowtype;
declare target_title text;
begin
  if length(coalesce(input_token,'')) <> 64 then return jsonb_build_object('valid',false); end if;
  select * into target_invite from public.project_invites
    where claim_token=input_token;
  if target_invite.id is null then return jsonb_build_object('valid',false); end if;
  select title into target_title from public.book_projects
    where id=target_invite.book_project_id and status='active';
  return jsonb_build_object('valid',target_title is not null
      and target_invite.status='pending' and target_invite.expires_at>now(),
    'title',target_title,'role',target_invite.role,
    'expires_at',target_invite.expires_at);
end;
$$;

create or replace function public.accept_project_role_invite(input_token text)
returns jsonb language plpgsql security definer
set search_path = public, auth as $$
declare target_invite public.project_invites%rowtype;
declare target_project public.book_projects%rowtype;
declare current_person_id uuid;
begin
  if auth.uid() is null then raise exception 'ログインが必要です' using errcode='42501'; end if;
  if length(coalesce(input_token,'')) <> 64 then
    raise exception '招待リンクを確認できません' using errcode='22023'; end if;
  select * into target_invite from public.project_invites
    where claim_token=input_token for update;
  if target_invite.id is null or target_invite.status<>'pending'
     or target_invite.expires_at<=now()
     or target_invite.role not in ('supporter','co_manager') then
    raise exception '招待リンクが無効か期限切れです' using errcode='22023';
  end if;
  select * into target_project from public.book_projects
    where id=target_invite.book_project_id and status='active';
  if target_project.id is null or target_project.owner_user_id=auth.uid() then
    raise exception 'この招待は受け取れません' using errcode='42501'; end if;
  select person_id into current_person_id from public.user_person_links
    where user_id=auth.uid() and role='self' order by created_at limit 1;
  if target_invite.role='supporter' and exists (
    select 1 from public.project_supporters ps
    where ps.book_project_id=target_project.id and ps.supporter_user_id=auth.uid()
      and ps.status='active' and ps.meta_json ->> 'support_role'='co_manager'
  ) then
    raise exception 'すでに共同管理者として参加しています' using errcode='22023';
  end if;
  insert into public.project_supporters (
    book_project_id,supporter_user_id,supporter_person_id,granted_by_user_id,
    status,can_operate_recording,can_manage_photos,can_edit_book_text,
    can_build_book,can_view_raw_audio,can_change_sharing,can_change_legacy,
    can_delete_story,revoked_at,meta_json
  ) values (
    target_project.id,auth.uid(),current_person_id,target_invite.inviter_user_id,
    'active',true,true,true,true,
    target_invite.role='co_manager',target_invite.role='co_manager',
    false,false,null,
    jsonb_build_object('support_role',case when target_invite.role='co_manager'
      then 'co_manager' else 'helper' end,'source','project_role_link',
      'invite_id',target_invite.id)
  ) on conflict on constraint project_supporters_project_user_unique
  do update set
    status='active',revoked_at=null,
    can_operate_recording=true,can_manage_photos=true,
    can_edit_book_text=true,can_build_book=true,
    can_view_raw_audio=excluded.can_view_raw_audio,
    can_change_sharing=excluded.can_change_sharing,
    can_change_legacy=false,can_delete_story=false,
    meta_json=coalesce(project_supporters.meta_json,'{}'::jsonb)
      || excluded.meta_json,updated_at=now();
  update public.project_invites set status='accepted',accepted_at=now()
    where id=target_invite.id;
  return jsonb_build_object('success',true,'book_project_id',target_project.id,
    'role',target_invite.role);
end;
$$;

create or replace function public.revoke_project_role_invite(input_invite_id uuid)
returns boolean language plpgsql security definer
set search_path = public, auth as $$
declare target_invite public.project_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'ログインが必要です' using errcode='42501'; end if;
  select * into target_invite from public.project_invites
    where id=input_invite_id and claim_token is not null for update;
  if target_invite.id is null or not (target_invite.inviter_user_id=auth.uid()
    or exists(select 1 from public.book_projects bp where bp.id=target_invite.book_project_id
      and bp.owner_user_id=auth.uid())) then
    raise exception '招待を取り消せません' using errcode='42501'; end if;
  if target_invite.status<>'pending' then return false; end if;
  update public.project_invites set status='cancelled' where id=target_invite.id;
  return true;
end;
$$;

create or replace function public.list_project_role_invites(input_book_project_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, auth as $$
declare result jsonb;
begin
  if auth.uid() is null or not (
    exists(select 1 from public.book_projects bp
      where bp.id=input_book_project_id and bp.owner_user_id=auth.uid())
    or public.is_project_co_manager(input_book_project_id)) then
    raise exception '招待を確認できません' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'invite_id',pi.id,'token',pi.claim_token,'role',pi.role,
    'expires_at',pi.expires_at,'status',pi.status
  ) order by pi.created_at desc),'[]'::jsonb) into result
  from public.project_invites pi
  where pi.book_project_id=input_book_project_id and pi.claim_token is not null
    and pi.status='pending' and pi.expires_at>now();
  return result;
end;
$$;

revoke all on function public.issue_project_role_invite(uuid,text) from public,anon;
revoke all on function public.accept_project_role_invite(text) from public,anon;
revoke all on function public.revoke_project_role_invite(uuid) from public,anon;
revoke all on function public.list_project_role_invites(uuid) from public,anon;
grant execute on function public.issue_project_role_invite(uuid,text) to authenticated;
grant execute on function public.accept_project_role_invite(text) to authenticated;
grant execute on function public.revoke_project_role_invite(uuid) to authenticated;
grant execute on function public.list_project_role_invites(uuid) to authenticated;
grant execute on function public.preview_project_role_invite(text) to anon,authenticated;
