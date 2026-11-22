-- Profile portraits are private family media, not BOOK answer photos.
alter table public.persons add column if not exists portrait_storage_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('family-person-portraits','family-person-portraits',false,5000000,
  array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

-- Path: uploader UUID / person UUID / random filename. Only the family owner
-- can upload, and only the portrait currently referenced by the person is read.
create policy family_person_portrait_upload on storage.objects for insert to authenticated
  with check (bucket_id='family-person-portraits'
    and split_part(name,'/',1)=(select auth.uid())::text
    and exists (select 1 from public.persons p join public.families f on f.id=p.family_id
      where p.id=nullif(split_part(name,'/',2),'')::uuid
        and f.owner_user_id=(select auth.uid())));

create policy family_person_portrait_read on storage.objects for select to authenticated
  using (bucket_id='family-person-portraits'
    and exists (select 1 from public.persons p join public.families f on f.id=p.family_id
      where p.portrait_storage_path=name
        and f.owner_user_id=(select auth.uid())));

-- Only a failed, unlinked upload can be removed; saved portraits remain intact.
create policy family_person_portrait_discard on storage.objects for delete to authenticated
  using (bucket_id='family-person-portraits'
    and split_part(name,'/',1)=(select auth.uid())::text
    and not exists (select 1 from public.persons p where p.portrait_storage_path=name));
