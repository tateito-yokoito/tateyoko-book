begin;

create table if not exists public.family_memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.persons(id) on delete set null,
  relationship_label text not null default 'other',
  invited_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_memberships_identity_unique unique (family_id, user_id),
  constraint family_memberships_relationship_check check (
    relationship_label in ('child', 'parent', 'spouse', 'sibling', 'grandchild', 'other')
  ),
  constraint family_memberships_status_check check (status in ('active', 'revoked'))
);

create table if not exists public.story_relationship_invites (
  id uuid primary key default gen_random_uuid(),
  book_project_id uuid not null references public.book_projects(id) on delete cascade,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_email text not null,
  invite_type text not null,
  invitee_name text,
  relationship_label text,
  status text not null default 'pending',
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_person_id uuid references public.persons(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  email_delivery_status text not null default 'not_sent',
  email_attempted_at timestamptz,
  email_sent_at timestamptz,
  email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  meta_json jsonb not null default '{}'::jsonb,
  constraint story_relationship_invites_type_check check (invite_type in ('family', 'selected')),
  constraint story_relationship_invites_status_check check (status in ('pending', 'accepted', 'declined', 'revoked')),
  constraint story_relationship_invites_relationship_check check (
    relationship_label is null or relationship_label in ('child', 'parent', 'spouse', 'sibling', 'grandchild', 'other')
  )
);

create unique index if not exists story_relationship_invites_active_unique
  on public.story_relationship_invites (book_project_id, lower(btrim(invitee_email)), invite_type)
  where status in ('pending', 'accepted');

-- 同じ人が「ファミリー」「選んだ人」「サポーター」を兼ねられるよう、
-- 共有相手は由来ごとに独立して保持する。
drop index if exists public.story_share_recipients_person_unique;
drop index if exists public.story_share_recipients_user_unique;
create unique index story_share_recipients_person_unique
  on public.story_share_recipients (
    sharing_preference_id, recipient_person_id, recipient_phase, source
  ) where recipient_person_id is not null;
create unique index story_share_recipients_user_unique
  on public.story_share_recipients (
    sharing_preference_id, recipient_user_id, recipient_phase, source
  ) where recipient_user_id is not null;

create or replace function public.keep_story_recipient_source()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.source := old.source; end if;
  return new;
end;
$$;
drop trigger if exists story_share_recipients_source_immutable on public.story_share_recipients;
create trigger story_share_recipients_source_immutable
before update of source on public.story_share_recipients
for each row execute function public.keep_story_recipient_source();

drop trigger if exists family_memberships_updated_at on public.family_memberships;
create trigger family_memberships_updated_at
before update on public.family_memberships
for each row execute function public.set_tateyoko_updated_at();

drop trigger if exists story_relationship_invites_updated_at on public.story_relationship_invites;
create trigger story_relationship_invites_updated_at
before update on public.story_relationship_invites
for each row execute function public.set_tateyoko_updated_at();

alter table public.family_memberships enable row level security;
alter table public.story_relationship_invites enable row level security;

drop policy if exists family_memberships_visible_to_participants on public.family_memberships;
create policy family_memberships_visible_to_participants
on public.family_memberships for select
using (
  user_id = auth.uid() or exists (
    select 1 from public.families f
    where f.id = family_memberships.family_id and f.owner_user_id = auth.uid()
  )
);

drop policy if exists story_relationship_invites_owner_select on public.story_relationship_invites;
create policy story_relationship_invites_owner_select
on public.story_relationship_invites for select
using (
  inviter_user_id = auth.uid() or
  lower(btrim(invitee_email)) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
);

create or replace function public.create_story_relationship_invite(
  input_book_project_id uuid,
  input_email text,
  input_invite_type text,
  input_invitee_name text default null,
  input_relationship_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text := lower(btrim(coalesce(input_email, '')));
  target_preference public.story_sharing_preferences%rowtype;
  new_id uuid;
begin
  if not exists (
    select 1 from public.book_projects bp
    where bp.id = input_book_project_id and bp.owner_user_id = auth.uid() and bp.status = 'active'
  ) then raise exception 'Project owner access is required'; end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid email address is required';
  end if;
  if input_invite_type not in ('family', 'selected') then raise exception 'Invalid invitation type'; end if;

  insert into public.story_sharing_preferences (book_project_id, owner_person_id, live_scope)
  select bp.id, bp.subject_person_id, 'private' from public.book_projects bp where bp.id = input_book_project_id
  on conflict on constraint story_sharing_preferences_project_unique do nothing;

  update public.story_sharing_preferences
  set
    family_sharing_enabled = family_sharing_enabled or input_invite_type = 'family',
    selected_sharing_enabled = selected_sharing_enabled or input_invite_type = 'selected',
    live_scope = case
      when selected_sharing_enabled or input_invite_type = 'selected' then 'selected'
      when family_sharing_enabled or input_invite_type = 'family' then 'family'
      else 'private'
    end,
    initial_setup_completed_at = coalesce(initial_setup_completed_at, now()),
    updated_at = now()
  where book_project_id = input_book_project_id;

  update public.story_relationship_invites
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where book_project_id = input_book_project_id
    and lower(btrim(invitee_email)) = normalized_email
    and invite_type = input_invite_type
    and status in ('pending', 'accepted');

  insert into public.story_relationship_invites (
    book_project_id, inviter_user_id, invitee_email, invite_type,
    invitee_name, relationship_label
  ) values (
    input_book_project_id, auth.uid(), normalized_email, input_invite_type,
    nullif(btrim(coalesce(input_invitee_name, '')), ''),
    case when input_invite_type = 'family' then coalesce(input_relationship_label, 'other') else null end
  ) returning id into new_id;
  return new_id;
end;
$$;

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
  if not exists (select 1 from public.book_projects bp where bp.id = input_book_project_id and bp.owner_user_id = auth.uid())
  then raise exception 'Project owner access is required'; end if;
  return query
  select i.id, i.invite_type, i.invitee_email,
    coalesce(p.preferred_name, p.display_name, i.invitee_name, i.invitee_email),
    i.relationship_label, i.status, i.email_delivery_status,
    exists (select 1 from public.project_supporters ps where ps.book_project_id = i.book_project_id and ps.supporter_user_id = i.recipient_user_id and ps.status = 'active'),
    i.created_at
  from public.story_relationship_invites i
  left join public.persons p on p.id = i.recipient_person_id
  where i.book_project_id = input_book_project_id and i.status <> 'revoked'
  order by i.created_at desc;
end;
$$;

create or replace function public.list_pending_story_relationship_invites()
returns table (
  invite_id uuid, invite_type text, project_title text, owner_name text,
  relationship_label text, invitee_email text
)
language sql stable security definer set search_path = public, auth
as $$
  select i.id, i.invite_type, bp.title,
    coalesce(p.preferred_name, p.display_name, 'ご家族'), i.relationship_label, i.invitee_email
  from public.story_relationship_invites i
  join public.book_projects bp on bp.id = i.book_project_id and bp.status = 'active'
  left join public.persons p on p.id = bp.subject_person_id
  where i.status = 'pending'
    and lower(btrim(i.invitee_email)) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  order by i.created_at asc;
$$;

create or replace function public.respond_to_story_relationship_invite(input_invite_id uuid, input_accept boolean)
returns boolean language plpgsql security definer set search_path = public, auth
as $$
declare
  target public.story_relationship_invites%rowtype;
  target_family_id uuid;
  target_pref_id uuid;
  self_person_id uuid;
begin
  select * into target from public.story_relationship_invites i
  where i.id = input_invite_id and i.status = 'pending'
    and lower(btrim(i.invitee_email)) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  for update;
  if target.id is null then raise exception 'Invitation is not available'; end if;
  if not input_accept then
    update public.story_relationship_invites set status = 'declined', updated_at = now() where id = target.id;
    return true;
  end if;
  select upl.person_id into self_person_id from public.user_person_links upl
    where upl.user_id = auth.uid() and upl.role = 'self' order by upl.created_at asc limit 1;
  select bp.family_id into target_family_id from public.book_projects bp where bp.id = target.book_project_id;
  select pref.id into target_pref_id from public.story_sharing_preferences pref where pref.book_project_id = target.book_project_id;

  if target.invite_type = 'family' then
    insert into public.family_memberships (family_id, user_id, person_id, relationship_label, invited_by_user_id, status, accepted_at)
    values (target_family_id, auth.uid(), self_person_id, coalesce(target.relationship_label, 'other'), target.inviter_user_id, 'active', now())
    on conflict (family_id, user_id) do update set person_id = excluded.person_id, relationship_label = excluded.relationship_label,
      status = 'active', accepted_at = now(), revoked_at = null, updated_at = now();
  end if;

  if target_pref_id is not null then
    insert into public.story_share_recipients (sharing_preference_id, recipient_person_id, recipient_user_id, recipient_phase, source, status, meta_json)
    values (target_pref_id, self_person_id, auth.uid(), 'live', target.invite_type, 'active', jsonb_build_object('relationship_invite_id', target.id))
    on conflict do nothing;
    update public.story_share_recipients set status = 'active', updated_at = now()
    where sharing_preference_id = target_pref_id and recipient_user_id = auth.uid()
      and recipient_phase = 'live' and source = target.invite_type;
  end if;
  update public.story_relationship_invites set status = 'accepted', recipient_user_id = auth.uid(), recipient_person_id = self_person_id,
    accepted_at = now(), updated_at = now() where id = target.id;
  return true;
end;
$$;

create or replace function public.revoke_story_relationship(input_book_project_id uuid, input_relationship_id uuid)
returns boolean language plpgsql security definer set search_path = public, auth
as $$
declare target public.story_relationship_invites%rowtype;
begin
  if not exists (select 1 from public.book_projects bp where bp.id = input_book_project_id and bp.owner_user_id = auth.uid())
  then raise exception 'Project owner access is required'; end if;
  select * into target from public.story_relationship_invites where id = input_relationship_id and book_project_id = input_book_project_id;
  if target.id is null then return false; end if;
  update public.story_relationship_invites set status = 'revoked', revoked_at = now(), updated_at = now() where id = target.id;
  update public.story_share_recipients r set status = 'revoked', updated_at = now()
  from public.story_sharing_preferences pref where pref.id = r.sharing_preference_id and pref.book_project_id = input_book_project_id
    and r.recipient_user_id = target.recipient_user_id and r.source = target.invite_type;
  if target.invite_type = 'family' and target.recipient_user_id is not null then
    update public.family_memberships fm set status = 'revoked', revoked_at = now(), updated_at = now()
    from public.book_projects bp where bp.id = input_book_project_id and fm.family_id = bp.family_id and fm.user_id = target.recipient_user_id;
  end if;
  return true;
end;
$$;

create or replace function public.disable_story_sharing_scope(input_book_project_id uuid, input_scope text)
returns boolean language plpgsql security definer set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.book_projects bp where bp.id = input_book_project_id and bp.owner_user_id = auth.uid())
  then raise exception 'Project owner access is required'; end if;
  if input_scope = 'selected' then
    update public.project_supporters set status = 'revoked', revoked_at = now(), updated_at = now()
      where book_project_id = input_book_project_id and status = 'active';
    update public.project_invites set status = 'declined'
      where book_project_id = input_book_project_id and role = 'supporter' and status = 'pending';
    update public.story_share_recipients r set status = 'revoked', updated_at = now()
      from public.story_sharing_preferences pref where pref.id = r.sharing_preference_id
        and pref.book_project_id = input_book_project_id and r.source = 'supporter';
    update public.story_sharing_preferences set selected_sharing_enabled = false,
      live_scope = case when family_sharing_enabled then 'family' else 'private' end, updated_at = now()
      where book_project_id = input_book_project_id;
  elsif input_scope = 'family' then
    update public.story_sharing_preferences set family_sharing_enabled = false,
      live_scope = case when selected_sharing_enabled then 'selected' else 'private' end, updated_at = now()
      where book_project_id = input_book_project_id;
  else raise exception 'Invalid sharing scope'; end if;
  return true;
end;
$$;

create or replace function public.update_own_profile_name(input_family_name text, input_given_name text)
returns table (family_name text, given_name text, display_name text, preferred_name text)
language plpgsql security definer set search_path = public, auth
as $$
declare f text := btrim(coalesce(input_family_name, '')); g text := btrim(coalesce(input_given_name, '')); d text;
begin
  if f = '' or g = '' then raise exception 'Family name and given name are required'; end if;
  d := f || ' ' || g;
  update public.profiles set family_name = f, given_name = g, display_name = d, preferred_name = g || 'さん' where id = auth.uid();
  update public.persons p set family_name = f, given_name = g, display_name = d, preferred_name = g || 'さん'
  from public.user_person_links upl where upl.person_id = p.id and upl.user_id = auth.uid() and upl.role = 'self';
  return query select f, g, d, g || 'さん';
end;
$$;

create or replace function public.shared_story_recipient_can_view(input_book_project_id uuid)
returns boolean language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from public.story_sharing_preferences pref
    join public.story_share_recipients r on r.sharing_preference_id = pref.id
    where pref.book_project_id = input_book_project_id and r.recipient_user_id = auth.uid()
      and r.status = 'active' and r.recipient_phase in ('live','both')
      and ((r.source = 'family' and pref.family_sharing_enabled) or (r.source = 'direct' and pref.selected_sharing_enabled))
  ) or exists (
    select 1 from public.book_projects bp
    join public.story_sharing_preferences pref on pref.book_project_id = bp.id
    join public.family_memberships fm on fm.family_id = bp.family_id
    where bp.id = input_book_project_id and pref.family_sharing_enabled
      and fm.user_id = auth.uid() and fm.status = 'active'
  );
$$;

drop policy if exists answers_shared_recipient_select on public.answers;
create policy answers_shared_recipient_select on public.answers for select
using (access_override <> 'private_forever' and public.shared_story_recipient_can_view(book_project_id));

drop policy if exists media_assets_shared_recipient_select on public.media_assets;
create policy media_assets_shared_recipient_select on public.media_assets for select
using (public.shared_story_recipient_can_view(book_project_id));

revoke all on function public.create_story_relationship_invite(uuid,text,text,text,text) from public;
revoke all on function public.list_owned_story_relationships(uuid) from public;
revoke all on function public.list_pending_story_relationship_invites() from public;
revoke all on function public.respond_to_story_relationship_invite(uuid,boolean) from public;
revoke all on function public.revoke_story_relationship(uuid,uuid) from public;
revoke all on function public.disable_story_sharing_scope(uuid,text) from public;
revoke all on function public.update_own_profile_name(text,text) from public;
revoke all on function public.shared_story_recipient_can_view(uuid) from public;
grant execute on function public.create_story_relationship_invite(uuid,text,text,text,text) to authenticated;
grant execute on function public.list_owned_story_relationships(uuid) to authenticated;
grant execute on function public.list_pending_story_relationship_invites() to authenticated;
grant execute on function public.respond_to_story_relationship_invite(uuid,boolean) to authenticated;
grant execute on function public.revoke_story_relationship(uuid,uuid) to authenticated;
grant execute on function public.disable_story_sharing_scope(uuid,text) to authenticated;
grant execute on function public.update_own_profile_name(text,text) to authenticated;
grant execute on function public.shared_story_recipient_can_view(uuid) to authenticated;

commit;
