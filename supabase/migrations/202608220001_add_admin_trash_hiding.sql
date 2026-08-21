begin;

-- Minimal admin trash: keep every production record intact and only let the
-- operations UI omit explicitly selected projects/accounts.
create table if not exists public.admin_trash_entries (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  trashed_by_admin_user_id uuid not null references auth.users(id) on delete restrict,
  snapshot jsonb not null default '{}'::jsonb,
  trashed_at timestamptz not null default now(),
  constraint admin_trash_entries_entity_type_check
    check (entity_type in ('book_project', 'account')),
  constraint admin_trash_entries_entity_unique unique (entity_type, entity_id)
);

create index if not exists admin_trash_entries_trashed_at_idx
  on public.admin_trash_entries(trashed_at desc);

alter table public.admin_trash_entries enable row level security;
revoke all on table public.admin_trash_entries from public, anon, authenticated;
grant all on table public.admin_trash_entries to service_role;

create or replace function public.get_admin_current_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select au.role
  from public.admin_users au
  where au.user_id = auth.uid()
    and au.is_active = true;
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
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'entity_type', trash.entity_type,
    'entity_id', trash.entity_id,
    'snapshot', trash.snapshot,
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
  admin_role text;
  entity_snapshot jsonb;
  inserted_id uuid;
begin
  select au.role
  into admin_role
  from public.admin_users au
  where au.user_id = auth.uid()
    and au.is_active = true;

  if auth.uid() is null or admin_role is null or admin_role not in ('owner', 'operator') then
    raise exception 'Owner or operator access required' using errcode = '42501';
  end if;

  if normalized_type = 'book_project' then
    select jsonb_build_object(
      'title', bp.title,
      'owner_user_id', bp.owner_user_id,
      'subject_person_id', bp.subject_person_id,
      'access_status', bp.access_status,
      'purchased_at', bp.purchased_at
    )
    into entity_snapshot
    from public.book_projects bp
    where bp.id = input_entity_id;
  elsif normalized_type = 'account' then
    if exists (
      select 1 from public.admin_users au
      where au.user_id = input_entity_id and au.is_active = true
    ) then
      raise exception 'Active admin accounts cannot be moved to trash' using errcode = '22023';
    end if;

    select jsonb_build_object(
      'email', u.email,
      'display_name', coalesce(
        nullif(btrim(concat_ws(' ', nullif(p.family_name, ''), nullif(p.given_name, ''))), ''),
        nullif(p.display_name, ''),
        u.email,
        '名称未登録'
      ),
      'owned_project_count', (
        select count(*) from public.book_projects bp where bp.owner_user_id = u.id
      )
    )
    into entity_snapshot
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = input_entity_id;
  else
    raise exception 'Unsupported trash entity type' using errcode = '22023';
  end if;

  if entity_snapshot is null then
    raise exception 'Trash target not found' using errcode = 'P0002';
  end if;

  insert into public.admin_trash_entries(
    entity_type,
    entity_id,
    trashed_by_admin_user_id,
    snapshot
  )
  values (normalized_type, input_entity_id, auth.uid(), entity_snapshot)
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
      'move_to_trash',
      normalized_type,
      input_entity_id,
      jsonb_build_object('snapshot', entity_snapshot)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'entity_type', normalized_type,
    'entity_id', input_entity_id,
    'already_trashed', inserted_id is null
  );
end;
$$;

revoke all on function public.get_admin_current_role() from public;
revoke all on function public.get_admin_trash_index() from public;
revoke all on function public.move_admin_entity_to_trash(text, uuid) from public;

grant execute on function public.get_admin_current_role() to authenticated;
grant execute on function public.get_admin_trash_index() to authenticated;
grant execute on function public.move_admin_entity_to_trash(text, uuid) to authenticated;

comment on table public.admin_trash_entries is
  '管理画面から非表示にした物語・アカウント。元データは削除しない。';

comment on function public.move_admin_entity_to_trash(text, uuid) is
  'owner/operatorが物語またはアカウントを管理画面上のゴミ箱へ移動する。';

commit;
