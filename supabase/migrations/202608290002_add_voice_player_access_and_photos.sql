begin;

alter table public.voice_publications
  add column if not exists access_mode text not null default 'link',
  add column if not exists access_code_hash text,
  add column if not exists access_code_changed_at timestamptz;

alter table public.voice_publications
  drop constraint if exists voice_publications_access_mode_check;
alter table public.voice_publications
  add constraint voice_publications_access_mode_check
  check (access_mode in ('link', 'code'));

alter table public.voice_publication_items
  add column if not exists photo_assets jsonb not null default '[]'::jsonb;

alter table public.voice_publication_items
  drop constraint if exists voice_publication_items_photo_assets_check;
alter table public.voice_publication_items
  add constraint voice_publication_items_photo_assets_check
  check (jsonb_typeof(photo_assets) = 'array');

create table if not exists public.voice_publication_access_sessions (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null
    references public.voice_publications(id)
    on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists voice_publication_access_sessions_lookup_idx
  on public.voice_publication_access_sessions(publication_id, token_hash, expires_at);

alter table public.voice_publication_access_sessions enable row level security;
revoke all on public.voice_publication_access_sessions from anon, authenticated;

create or replace function public.set_voice_publication_access_code(
  input_publication_id uuid,
  input_code text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_code text := btrim(coalesce(input_code, ''));
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;

  if normalized_code = '' then
    update public.voice_publications
    set access_mode = 'link',
        access_code_hash = null,
        access_code_changed_at = now()
    where id = input_publication_id;
  else
    if normalized_code !~ '^[0-9]{4,8}$' then
      raise exception 'access code must be 4 to 8 digits';
    end if;

    update public.voice_publications
    set access_mode = 'code',
        access_code_hash = crypt(normalized_code, gen_salt('bf', 10)),
        access_code_changed_at = now()
    where id = input_publication_id;
  end if;

  delete from public.voice_publication_access_sessions
  where publication_id = input_publication_id;
end;
$$;

create or replace function public.verify_voice_publication_access_code(
  input_publication_id uuid,
  input_code text
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select case
    when auth.role() <> 'service_role' then false
    else exists (
      select 1
      from public.voice_publications publication
      where publication.id = input_publication_id
        and publication.access_mode = 'code'
        and publication.access_code_hash is not null
        and crypt(btrim(coalesce(input_code, '')), publication.access_code_hash)
          = publication.access_code_hash
    )
  end;
$$;

revoke all on function public.set_voice_publication_access_code(uuid, text) from public;
revoke all on function public.verify_voice_publication_access_code(uuid, text) from public;
grant execute on function public.set_voice_publication_access_code(uuid, text) to service_role;
grant execute on function public.verify_voice_publication_access_code(uuid, text) to service_role;

create or replace function public.list_voice_library()
returns table (
  publication_id uuid,
  public_id text,
  book_project_id uuid,
  title text,
  subtitle text,
  subject_name text,
  published_at timestamptz,
  access_mode text,
  relationship text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    publication.id,
    publication.public_id,
    publication.book_project_id,
    publication.book_title,
    publication.book_subtitle,
    publication.subject_name,
    publication.published_at,
    publication.access_mode,
    case
      when project.owner_user_id = auth.uid() then 'owner'
      when project.purchaser_user_id = auth.uid() then 'purchased'
      when public.can_manage_book_cover(publication.book_project_id) then 'managed'
      else 'shared'
    end
  from public.voice_publications publication
  join public.book_projects project
    on project.id = publication.book_project_id
  where auth.uid() is not null
    and publication.status = 'published'
    and (
      project.owner_user_id = auth.uid()
      or project.purchaser_user_id = auth.uid()
      or public.can_manage_book_cover(publication.book_project_id)
      or public.shared_story_recipient_can_view(publication.book_project_id)
    )
  order by publication.published_at desc nulls last, publication.created_at desc;
$$;

revoke all on function public.list_voice_library() from public;
grant execute on function public.list_voice_library() to authenticated;

comment on column public.voice_publications.access_mode is
  'link は推測困難URLだけで閲覧可、code は追加の数字暗証番号が必要。';

comment on column public.voice_publication_items.photo_assets is
  '発行時点で固定コピーした写真。音声と同様、編集可能な元データを参照しない。';

comment on function public.list_voice_library() is
  '本人・管理者・共有許可された家族のWeb冊子を本棚用に返す。';

commit;
