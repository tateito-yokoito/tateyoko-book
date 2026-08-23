begin;

-- Track why a project was hidden so restoring an account only restores the
-- projects hidden by that retirement. Projects hidden manually stay hidden.
alter table public.admin_trash_entries
  add column if not exists trash_origin text;

update public.admin_trash_entries
set trash_origin = 'manual'
where trash_origin is null;

alter table public.admin_trash_entries
  alter column trash_origin set default 'manual',
  alter column trash_origin set not null;

alter table public.admin_trash_entries
  add column if not exists source_account_id uuid references auth.users(id) on delete restrict;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_trash_entries_origin_check'
      and conrelid = 'public.admin_trash_entries'::regclass
  ) then
    alter table public.admin_trash_entries
      add constraint admin_trash_entries_origin_check
      check (trash_origin in ('manual', 'account_retirement'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_trash_entries_origin_account_check'
      and conrelid = 'public.admin_trash_entries'::regclass
  ) then
    alter table public.admin_trash_entries
      add constraint admin_trash_entries_origin_account_check
      check (
        (trash_origin = 'manual' and source_account_id is null)
        or (
          trash_origin = 'account_retirement'
          and entity_type = 'book_project'
          and source_account_id is not null
        )
      );
  end if;
end;
$$;

create index if not exists admin_trash_entries_source_account_idx
  on public.admin_trash_entries(source_account_id)
  where source_account_id is not null;

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
    'trash_origin', trash.trash_origin,
    'source_account_id', trash.source_account_id,
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

  if normalized_type = 'book_project' and target_entry.trash_origin = 'account_retirement' then
    raise exception 'Projects hidden by account retirement must be restored with the account' using errcode = '22023';
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

-- Service-role-only transaction boundary used after the Auth account has
-- been banned and its email has been replaced with a tombstone address.
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
declare
  auto_hidden_project_count integer := 0;
  account_snapshot jsonb;
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

  with inserted_projects as (
    insert into public.admin_trash_entries(
      entity_type,
      entity_id,
      lifecycle_status,
      trash_origin,
      source_account_id,
      trashed_by_admin_user_id,
      trashed_at,
      snapshot
    )
    select
      'book_project',
      project.id,
      'hidden',
      'account_retirement',
      input_account_id,
      input_actor_id,
      now(),
      jsonb_build_object(
        'title', project.title,
        'display_name', coalesce(
          nullif(btrim(concat_ws(' ', nullif(to_jsonb(subject) ->> 'family_name', ''), nullif(to_jsonb(subject) ->> 'given_name', ''))), ''),
          nullif(to_jsonb(subject) ->> 'preferred_name', ''),
          nullif(to_jsonb(subject) ->> 'display_name', ''),
          project.title,
          '名称未登録'
        ),
        'owner_user_id', project.owner_user_id,
        'owner_email', lower(btrim(input_original_email)),
        'subject_person_id', project.subject_person_id,
        'access_status', project.access_status,
        'purchased_at', project.purchased_at
      )
    from public.book_projects project
    left join public.persons subject on subject.id = project.subject_person_id
    where project.owner_user_id = input_account_id
    on conflict (entity_type, entity_id) do nothing
    returning entity_id, snapshot
  )
  insert into public.admin_audit_logs(
    admin_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  select
    input_actor_id,
    'hide_entity',
    'book_project',
    inserted.entity_id,
    jsonb_build_object(
      'origin', 'account_retirement',
      'source_account_id', input_account_id,
      'snapshot', inserted.snapshot
    )
  from inserted_projects inserted;
  get diagnostics auto_hidden_project_count = row_count;

  account_snapshot := coalesce(input_snapshot, '{}'::jsonb) || jsonb_build_object(
    'auto_hidden_project_count', auto_hidden_project_count
  );

  insert into public.admin_trash_entries(
    entity_type,
    entity_id,
    lifecycle_status,
    trash_origin,
    source_account_id,
    trashed_by_admin_user_id,
    trashed_at,
    snapshot
  )
  values (
    'account',
    input_account_id,
    'retired',
    'manual',
    null,
    input_actor_id,
    now(),
    account_snapshot
  )
  on conflict (entity_type, entity_id) do update
  set lifecycle_status = 'retired',
      trash_origin = 'manual',
      source_account_id = null,
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
      'auto_hidden_project_count', auto_hidden_project_count,
      'snapshot', account_snapshot
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
  auto_restored_project_count integer := 0;
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

  with restored_projects as (
    delete from public.admin_trash_entries
    where entity_type = 'book_project'
      and trash_origin = 'account_retirement'
      and source_account_id = input_account_id
    returning entity_id, snapshot
  )
  insert into public.admin_audit_logs(
    admin_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  select
    input_actor_id,
    'restore_hidden_entity',
    'book_project',
    restored.entity_id,
    jsonb_build_object(
      'origin', 'account_restore',
      'source_account_id', input_account_id,
      'snapshot', restored.snapshot
    )
  from restored_projects restored;
  get diagnostics auto_restored_project_count = row_count;

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
      'restored_email', normalized_restore_email,
      'auto_restored_project_count', auto_restored_project_count
    )
  );
end;
$$;

-- Bring already-retired accounts into the same model. Existing manually
-- hidden projects win on conflict and therefore remain manual.
with inserted_projects as (
  insert into public.admin_trash_entries(
    entity_type,
    entity_id,
    lifecycle_status,
    trash_origin,
    source_account_id,
    trashed_by_admin_user_id,
    trashed_at,
    snapshot
  )
  select
    'book_project',
    project.id,
    'hidden',
    'account_retirement',
    retired.account_id,
    retired.retired_by_admin_user_id,
    retired.retired_at,
    jsonb_build_object(
      'title', project.title,
      'display_name', coalesce(
        nullif(btrim(concat_ws(' ', nullif(to_jsonb(subject) ->> 'family_name', ''), nullif(to_jsonb(subject) ->> 'given_name', ''))), ''),
        nullif(to_jsonb(subject) ->> 'preferred_name', ''),
        nullif(to_jsonb(subject) ->> 'display_name', ''),
        project.title,
        '名称未登録'
      ),
      'owner_user_id', project.owner_user_id,
      'owner_email', retired.original_email,
      'subject_person_id', project.subject_person_id,
      'access_status', project.access_status,
      'purchased_at', project.purchased_at
    )
  from public.admin_retired_accounts retired
  join public.book_projects project on project.owner_user_id = retired.account_id
  left join public.persons subject on subject.id = project.subject_person_id
  where retired.restored_at is null
  on conflict (entity_type, entity_id) do nothing
  returning source_account_id
)
select count(*) from inserted_projects;

update public.admin_trash_entries account_trash
set snapshot = account_trash.snapshot || jsonb_build_object(
  'auto_hidden_project_count', (
    select count(*)
    from public.admin_trash_entries project_trash
    where project_trash.entity_type = 'book_project'
      and project_trash.trash_origin = 'account_retirement'
      and project_trash.source_account_id = account_trash.entity_id
  )
)
where account_trash.entity_type = 'account'
  and account_trash.lifecycle_status = 'retired';

revoke all on function public.get_admin_trash_index() from public;
revoke all on function public.restore_admin_entity_from_trash(text, uuid) from public;
revoke all on function public.finalize_admin_account_retirement(uuid, uuid, text, text, jsonb) from public;
revoke all on function public.finalize_admin_account_restore(uuid, uuid, text, text) from public;

grant execute on function public.get_admin_trash_index() to authenticated;
grant execute on function public.restore_admin_entity_from_trash(text, uuid) to authenticated;
grant execute on function public.finalize_admin_account_retirement(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.finalize_admin_account_restore(uuid, uuid, text, text) to service_role;

comment on column public.admin_trash_entries.trash_origin is
  'manualは個別非表示、account_retirementはアカウント退役に連動した自動非表示。';

comment on column public.admin_trash_entries.source_account_id is
  'account_retirementで自動非表示にした物語の退役元アカウント。';

commit;
