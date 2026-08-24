begin;

create table if not exists public.book_cover_settings (
  book_project_id uuid primary key references public.book_projects(id) on delete cascade,
  title text not null default 'わたしの物語',
  subtitle text not null default '',
  cover_style text not null default 'cloth' check (cover_style in ('cloth', 'print')),
  cloth_color text not null default '#1f3a36',
  print_color text not null default '#a9bcb6',
  cover_photo_path text,
  cover_photo_transform jsonb not null default '{"pan_x":0,"pan_y":0,"zoom":1,"rotation":0,"brightness":0,"contrast":1}'::jsonb,
  suggestions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.can_manage_book_cover(input_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.book_projects bp
      where bp.id = input_project_id
        and bp.owner_user_id = auth.uid()
    )
    or public.is_tateyoko_admin()
    or exists (
      select 1
      from public.project_supporters ps
      where ps.book_project_id = input_project_id
        and ps.supporter_user_id = auth.uid()
        and ps.status = 'active'
        and ps.can_build_book = true
    )
  );
$$;

create or replace function public.book_cover_project_id_from_path(input_path text)
returns uuid
language plpgsql
immutable
as $$
declare
  project_text text;
begin
  if input_path !~ '^book-covers/[0-9a-fA-F-]{36}/' then
    return null;
  end if;

  project_text := split_part(input_path, '/', 2);
  return project_text::uuid;
exception when others then
  return null;
end;
$$;

alter table public.book_cover_settings enable row level security;

drop policy if exists book_cover_settings_read on public.book_cover_settings;
create policy book_cover_settings_read
on public.book_cover_settings for select to authenticated
using (public.can_manage_book_cover(book_project_id));

drop policy if exists book_cover_settings_insert on public.book_cover_settings;
create policy book_cover_settings_insert
on public.book_cover_settings for insert to authenticated
with check (public.can_manage_book_cover(book_project_id));

drop policy if exists book_cover_settings_update on public.book_cover_settings;
create policy book_cover_settings_update
on public.book_cover_settings for update to authenticated
using (public.can_manage_book_cover(book_project_id))
with check (public.can_manage_book_cover(book_project_id));

drop policy if exists book_cover_settings_delete on public.book_cover_settings;
create policy book_cover_settings_delete
on public.book_cover_settings for delete to authenticated
using (public.can_manage_book_cover(book_project_id));

revoke all on function public.can_manage_book_cover(uuid) from public;
revoke all on function public.book_cover_project_id_from_path(text) from public;

grant select, insert, update, delete on public.book_cover_settings to authenticated;
grant execute on function public.can_manage_book_cover(uuid) to authenticated;
grant execute on function public.book_cover_project_id_from_path(text) to authenticated;

drop policy if exists book_cover_photo_read on storage.objects;
create policy book_cover_photo_read
on storage.objects for select to authenticated
using (
  bucket_id = 'photos'
  and public.can_manage_book_cover(public.book_cover_project_id_from_path(name))
);

drop policy if exists book_cover_photo_insert on storage.objects;
create policy book_cover_photo_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'photos'
  and public.can_manage_book_cover(public.book_cover_project_id_from_path(name))
);

drop policy if exists book_cover_photo_update on storage.objects;
create policy book_cover_photo_update
on storage.objects for update to authenticated
using (
  bucket_id = 'photos'
  and public.can_manage_book_cover(public.book_cover_project_id_from_path(name))
)
with check (
  bucket_id = 'photos'
  and public.can_manage_book_cover(public.book_cover_project_id_from_path(name))
);

drop policy if exists book_cover_photo_delete on storage.objects;
create policy book_cover_photo_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'photos'
  and public.can_manage_book_cover(public.book_cover_project_id_from_path(name))
);

commit;
