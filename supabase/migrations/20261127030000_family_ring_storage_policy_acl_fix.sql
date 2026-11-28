-- Keep the family-ring manifest check behind a security-definer boundary.
-- Storage evaluates permissive INSERT policies even for other buckets, so a
-- direct manifest reference here blocks unrelated audio uploads with 42501.
create or replace function public.family_ring_media_upload_allowed(input_path text)
returns boolean language plpgsql stable security definer
set search_path=public,auth as $$
declare
  answer_text text := split_part(input_path,'/',2);
begin
  if auth.uid() is null
    or split_part(input_path,'/',1) is distinct from auth.uid()::text
    or answer_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or split_part(input_path,'/',3) = ''
    or split_part(input_path,'/',4) <> '' then
    return false;
  end if;
  return exists (
    select 1 from public.answers a
    join public.book_work_manifests w on w.book_project_id=a.book_project_id
    where a.id=answer_text::uuid
      and public.family_ring_is_self(a.subject_person_id)
      and w.confirmed_at is not null
      and a.id=any(w.answer_ids)
  );
end;
$$;
revoke all on function public.family_ring_media_upload_allowed(text) from public,anon;
grant execute on function public.family_ring_media_upload_allowed(text) to authenticated;

drop policy if exists family_ring_media_upload on storage.objects;
create policy family_ring_media_upload on storage.objects
  for insert to authenticated
  with check (bucket_id='family-ring-media'
    and public.family_ring_media_upload_allowed(name));
