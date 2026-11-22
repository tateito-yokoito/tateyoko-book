-- Bind the already authorized published-library rows to one exact Person ID.
-- The printed QR and public-voice delivery remain unchanged.
begin;

create function public.list_family_place_person_books(input_person_id uuid)
returns table (
  publication_id uuid, public_id text, book_project_id uuid,
  title text, subtitle text, subject_name text,
  published_at timestamptz, access_mode text, relationship text
)
language sql stable security definer set search_path = public, auth
as $$
  select l.publication_id, l.public_id, l.book_project_id,
    l.title, l.subtitle, l.subject_name, l.published_at,
    l.access_mode, l.relationship
  from public.list_voice_library() l
  join public.book_projects p on p.id = l.book_project_id
  where auth.uid() is not null
    and p.subject_person_id = input_person_id
    and l.public_id is not null;
$$;

revoke all on function public.list_family_place_person_books(uuid) from public, anon;
grant execute on function public.list_family_place_person_books(uuid) to authenticated;

comment on function public.list_family_place_person_books(uuid) is
  '既存の認証済み本棚に表示できる公開版だけを、対象人物IDに限定して返す。';

commit;
