begin;

-- The duration is intentionally data-driven so operations can change it later
-- without rebuilding the admin application.
create table if not exists public.admin_operation_settings (
  setting_key text primary key,
  integer_value integer not null,
  updated_at timestamptz not null default now(),
  constraint admin_operation_settings_positive_value_check
    check (integer_value > 0 and integer_value <= 1440)
);

insert into public.admin_operation_settings(setting_key, integer_value)
values ('organization_mode_minutes', 15)
on conflict (setting_key) do nothing;

create table if not exists public.admin_organization_mode_sessions (
  admin_user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint admin_organization_mode_sessions_expiry_check
    check (expires_at > started_at)
);

create index if not exists admin_organization_mode_sessions_expires_idx
  on public.admin_organization_mode_sessions(expires_at);

create table if not exists public.admin_retired_accounts (
  account_id uuid primary key references auth.users(id) on delete restrict,
  original_email text not null,
  tombstone_email text not null unique,
  retired_by_admin_user_id uuid not null references auth.users(id) on delete restrict,
  retired_at timestamptz not null default now(),
  restored_by_admin_user_id uuid references auth.users(id) on delete restrict,
  restored_at timestamptz,
  restored_email text
);

alter table public.admin_operation_settings enable row level security;
alter table public.admin_organization_mode_sessions enable row level security;
alter table public.admin_retired_accounts enable row level security;

revoke all on table public.admin_operation_settings from public, anon, authenticated;
revoke all on table public.admin_organization_mode_sessions from public, anon, authenticated;
revoke all on table public.admin_retired_accounts from public, anon, authenticated;
grant all on table public.admin_operation_settings to service_role;
grant all on table public.admin_organization_mode_sessions to service_role;
grant all on table public.admin_retired_accounts to service_role;

alter table public.admin_trash_entries
  add column if not exists lifecycle_status text;

update public.admin_trash_entries
set lifecycle_status = 'hidden'
where lifecycle_status is null;

alter table public.admin_trash_entries
  alter column lifecycle_status set default 'hidden',
  alter column lifecycle_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_trash_entries_lifecycle_status_check'
      and conrelid = 'public.admin_trash_entries'::regclass
  ) then
    alter table public.admin_trash_entries
      add constraint admin_trash_entries_lifecycle_status_check
      check (lifecycle_status in ('hidden', 'retired'));
  end if;
end;
$$;

create or replace function public.is_admin_organization_mode_active()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admin_organization_mode_sessions session_row
    join public.admin_users admin_row
      on admin_row.user_id = session_row.admin_user_id
    where session_row.admin_user_id = auth.uid()
      and session_row.expires_at > now()
      and admin_row.is_active = true
      and admin_row.role = 'owner'
  );
$$;

create or replace function public.get_admin_organization_mode_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  admin_role text;
  mode_expires_at timestamptz;
  duration_minutes integer;
begin
  select role
  into admin_role
  from public.admin_users
  where user_id = auth.uid()
    and is_active = true;

  if auth.uid() is null or admin_role is null then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select integer_value
  into duration_minutes
  from public.admin_operation_settings
  where setting_key = 'organization_mode_minutes';

  select expires_at
  into mode_expires_at
  from public.admin_organization_mode_sessions
  where admin_user_id = auth.uid()
    and expires_at > now();

  return jsonb_build_object(
    'role', admin_role,
    'can_start', admin_role = 'owner',
    'active', mode_expires_at is not null and admin_role = 'owner',
    'expires_at', mode_expires_at,
    'duration_minutes', coalesce(duration_minutes, 15)
  );
end;
$$;

create or replace function public.start_admin_organization_mode()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  last_authenticated_at timestamptz;
  duration_minutes integer;
  mode_expires_at timestamptz;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and is_active = true
      and role = 'owner'
  ) then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  select last_sign_in_at
  into last_authenticated_at
  from auth.users
  where id = auth.uid();

  if last_authenticated_at is null
     or last_authenticated_at < now() - interval '5 minutes' then
    raise exception 'Recent reauthentication required' using errcode = '42501';
  end if;

  select integer_value
  into duration_minutes
  from public.admin_operation_settings
  where setting_key = 'organization_mode_minutes';

  duration_minutes := coalesce(duration_minutes, 15);
  mode_expires_at := now() + make_interval(mins => duration_minutes);

  insert into public.admin_organization_mode_sessions(
    admin_user_id,
    started_at,
    expires_at
  )
  values (auth.uid(), now(), mode_expires_at)
  on conflict (admin_user_id) do update
  set started_at = excluded.started_at,
      expires_at = excluded.expires_at;

  insert into public.admin_audit_logs(
    admin_user_id,
    action,
    entity_type,
    metadata
  )
  values (
    auth.uid(),
    'start_organization_mode',
    'admin_session',
    jsonb_build_object(
      'duration_minutes', duration_minutes,
      'expires_at', mode_expires_at
    )
  );

  return jsonb_build_object(
    'active', true,
    'expires_at', mode_expires_at,
    'duration_minutes', duration_minutes
  );
end;
$$;

create or replace function public.end_admin_organization_mode()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  removed_count integer;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  delete from public.admin_organization_mode_sessions
  where admin_user_id = auth.uid();
  get diagnostics removed_count = row_count;

  if removed_count > 0 then
    insert into public.admin_audit_logs(
      admin_user_id,
      action,
      entity_type
    )
    values (auth.uid(), 'end_organization_mode', 'admin_session');
  end if;

  return jsonb_build_object('active', false);
end;
$$;

create or replace function public.get_admin_trash_index()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
  can_view_hidden_details boolean;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  can_view_hidden_details := public.is_admin_organization_mode_active();

  select coalesce(jsonb_agg(jsonb_build_object(
    'entity_type', trash.entity_type,
    'entity_id', trash.entity_id,
    'lifecycle_status', trash.lifecycle_status,
    'snapshot', case
      when can_view_hidden_details then trash.snapshot
      when trash.entity_type = 'book_project' then jsonb_build_object(
        'owner_user_id', trash.snapshot -> 'owner_user_id',
        'access_status', trash.snapshot -> 'access_status'
      )
      else '{}'::jsonb
    end,
    'trashed_at', trash.trashed_at
  ) order by trash.trashed_at desc), '[]'::jsonb)
  into result
  from public.admin_trash_entries trash;

  return result;
end;
$$;

create or replace function public.move_admin_entity_to_trash(
  input_entity_type text,
  input_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_type text := lower(btrim(coalesce(input_entity_type, '')));
  entity_snapshot jsonb;
  inserted_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and is_active = true
      and role = 'owner'
  ) or not public.is_admin_organization_mode_active() then
    raise exception 'Active owner organization mode required' using errcode = '42501';
  end if;

  if normalized_type <> 'book_project' then
    raise exception 'Account retirement must use the account lifecycle service' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'title', bp.title,
    'display_name', coalesce(
      nullif(btrim(concat_ws(' ', nullif(to_jsonb(subject) ->> 'family_name', ''), nullif(to_jsonb(subject) ->> 'given_name', ''))), ''),
      nullif(to_jsonb(subject) ->> 'preferred_name', ''),
      nullif(to_jsonb(subject) ->> 'display_name', ''),
      bp.title,
      '名称未登録'
    ),
    'owner_user_id', bp.owner_user_id,
    'owner_email', owner.email,
    'subject_person_id', bp.subject_person_id,
    'access_status', bp.access_status,
    'purchased_at', bp.purchased_at
  )
  into entity_snapshot
  from public.book_projects bp
  left join auth.users owner on owner.id = bp.owner_user_id
  left join public.persons subject on subject.id = bp.subject_person_id
  where bp.id = input_entity_id;

  if entity_snapshot is null then
    raise exception 'Trash target not found' using errcode = 'P0002';
  end if;

  insert into public.admin_trash_entries(
    entity_type,
    entity_id,
    lifecycle_status,
    trashed_by_admin_user_id,
    snapshot
  )
  values (normalized_type, input_entity_id, 'hidden', auth.uid(), entity_snapshot)
  on conflict (entity_type, entity_id) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    insert into public.admin_audit_logs(
      admin_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      auth.uid(),
      'hide_entity',
      normalized_type,
      input_entity_id,
      jsonb_build_object('snapshot', entity_snapshot)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'entity_type', normalized_type,
    'entity_id', input_entity_id,
    'already_hidden', inserted_id is null
  );
end;
$$;

create or replace function public.restore_admin_entity_from_trash(
  input_entity_type text,
  input_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_type text := lower(btrim(coalesce(input_entity_type, '')));
  target_entry public.admin_trash_entries%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and is_active = true
      and role = 'owner'
  ) or not public.is_admin_organization_mode_active() then
    raise exception 'Active owner organization mode required' using errcode = '42501';
  end if;

  select *
  into target_entry
  from public.admin_trash_entries
  where entity_type = normalized_type
    and entity_id = input_entity_id;

  if target_entry.id is null then
    raise exception 'Hidden target not found' using errcode = 'P0002';
  end if;

  if normalized_type = 'account' and target_entry.lifecycle_status = 'retired' then
    raise exception 'Retired accounts must use the account lifecycle service' using errcode = '22023';
  end if;

  delete from public.admin_trash_entries
  where id = target_entry.id;

  insert into public.admin_audit_logs(
    admin_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    auth.uid(),
    'restore_hidden_entity',
    normalized_type,
    input_entity_id,
    jsonb_build_object('snapshot', target_entry.snapshot)
  );

  return jsonb_build_object(
    'success', true,
    'entity_type', normalized_type,
    'entity_id', input_entity_id
  );
end;
$$;

-- These two functions are service-role-only transaction boundaries used by
-- the account lifecycle Edge Function after the Auth change succeeds.
create or replace function public.finalize_admin_account_retirement(
  input_actor_id uuid,
  input_account_id uuid,
  input_original_email text,
  input_tombstone_email text,
  input_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from public.admin_users admin_row
    join public.admin_organization_mode_sessions session_row
      on session_row.admin_user_id = admin_row.user_id
    where admin_row.user_id = input_actor_id
      and admin_row.is_active = true
      and admin_row.role = 'owner'
      and session_row.expires_at > now()
  ) then
    raise exception 'Active owner organization mode required' using errcode = '42501';
  end if;

  insert into public.admin_retired_accounts(
    account_id,
    original_email,
    tombstone_email,
    retired_by_admin_user_id,
    retired_at,
    restored_by_admin_user_id,
    restored_at,
    restored_email
  )
  values (
    input_account_id,
    lower(btrim(input_original_email)),
    lower(btrim(input_tombstone_email)),
    input_actor_id,
    now(),
    null,
    null,
    null
  )
  on conflict (account_id) do update
  set original_email = excluded.original_email,
      tombstone_email = excluded.tombstone_email,
      retired_by_admin_user_id = excluded.retired_by_admin_user_id,
      retired_at = excluded.retired_at,
      restored_by_admin_user_id = null,
      restored_at = null,
      restored_email = null;

  insert into public.admin_trash_entries(
    entity_type,
    entity_id,
    lifecycle_status,
    trashed_by_admin_user_id,
    trashed_at,
    snapshot
  )
  values (
    'account',
    input_account_id,
    'retired',
    input_actor_id,
    now(),
    input_snapshot
  )
  on conflict (entity_type, entity_id) do update
  set lifecycle_status = 'retired',
      trashed_by_admin_user_id = excluded.trashed_by_admin_user_id,
      trashed_at = excluded.trashed_at,
      snapshot = excluded.snapshot;

  insert into public.admin_audit_logs(
    admin_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    input_actor_id,
    'retire_account',
    'account',
    input_account_id,
    jsonb_build_object(
      'email_released', true,
      'snapshot', input_snapshot
    )
  );
end;
$$;

create or replace function public.finalize_admin_account_restore(
  input_actor_id uuid,
  input_account_id uuid,
  input_restore_email text,
  input_original_email text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  updated_count integer;
  normalized_restore_email text := lower(btrim(input_restore_email));
  normalized_original_email text := lower(btrim(input_original_email));
begin
  if not exists (
    select 1
    from public.admin_users admin_row
    join public.admin_organization_mode_sessions session_row
      on session_row.admin_user_id = admin_row.user_id
    where admin_row.user_id = input_actor_id
      and admin_row.is_active = true
      and admin_row.role = 'owner'
      and session_row.expires_at > now()
  ) then
    raise exception 'Active owner organization mode required' using errcode = '42501';
  end if;

  update public.admin_retired_accounts
  set restored_by_admin_user_id = input_actor_id,
      restored_at = now(),
      restored_email = normalized_restore_email
  where account_id = input_account_id
    and restored_at is null;
  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    raise exception 'Retired account record not found' using errcode = 'P0002';
  end if;

  delete from public.admin_trash_entries
  where entity_type = 'account'
    and entity_id = input_account_id
    and lifecycle_status = 'retired';

  insert into public.admin_audit_logs(
    admin_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    input_actor_id,
    'restore_retired_account',
    'account',
    input_account_id,
    jsonb_build_object(
      'original_email_reused', normalized_restore_email <> normalized_original_email,
      'restored_email', normalized_restore_email
    )
  );
end;
$$;

revoke all on function public.is_admin_organization_mode_active() from public;
revoke all on function public.get_admin_organization_mode_status() from public;
revoke all on function public.start_admin_organization_mode() from public;
revoke all on function public.end_admin_organization_mode() from public;
revoke all on function public.get_admin_trash_index() from public;
revoke all on function public.move_admin_entity_to_trash(text, uuid) from public;
revoke all on function public.restore_admin_entity_from_trash(text, uuid) from public;
revoke all on function public.finalize_admin_account_retirement(uuid, uuid, text, text, jsonb) from public;
revoke all on function public.finalize_admin_account_restore(uuid, uuid, text, text) from public;

grant execute on function public.get_admin_organization_mode_status() to authenticated;
grant execute on function public.start_admin_organization_mode() to authenticated;
grant execute on function public.end_admin_organization_mode() to authenticated;
grant execute on function public.get_admin_trash_index() to authenticated;
grant execute on function public.move_admin_entity_to_trash(text, uuid) to authenticated;
grant execute on function public.restore_admin_entity_from_trash(text, uuid) to authenticated;
grant execute on function public.finalize_admin_account_retirement(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.finalize_admin_account_restore(uuid, uuid, text, text) to service_role;

comment on table public.admin_operation_settings is
  '運営管理画面の変更可能な安全設定。organization_mode_minutesで整理モードの時間を管理する。';

comment on table public.admin_organization_mode_sessions is
  'ownerが再認証後に開始した、期限付き整理モード。';

comment on table public.admin_retired_accounts is
  '退役によりメールを解放したアカウントの復旧・競合判定用の非公開台帳。';

comment on function public.move_admin_entity_to_trash(text, uuid) is
  '有効な整理モード中のownerが物語を非表示にする。アカウント退役はEdge Functionを使う。';

commit;
