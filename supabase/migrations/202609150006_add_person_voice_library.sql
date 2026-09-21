begin;

-- Additive presentation metadata. Delegate the entire visibility decision to
-- the existing library RPC; do not broaden family, purchaser or supporter rights.
create or replace function public.list_voice_library_people()
returns table (
  publication_id uuid, public_id text, book_project_id uuid,
  title text, subtitle text, subject_name text, published_at timestamptz,
  access_mode text, relationship text, subject_person_id uuid, is_self boolean
)
language sql stable security definer set search_path = public
as $$
  select library.*, project.subject_person_id,
    exists (
      select 1 from public.user_person_links link
      where link.user_id = auth.uid()
        and link.role = 'self'
        and link.person_id = project.subject_person_id
    ) as is_self
  from public.list_voice_library() library
  join public.book_projects project on project.id = library.book_project_id
  where auth.uid() is not null;
$$;

revoke all on function public.list_voice_library_people() from public;
grant execute on function public.list_voice_library_people() to authenticated;
comment on function public.list_voice_library_people() is
  'Existing authorized published library, grouped in the UI by subject Person. No media or mutable cover data is exposed.';

commit;
