-- Qualify the outer Storage path: families.name otherwise shadows bare name.
drop policy if exists family_person_portrait_upload on storage.objects;
create policy family_person_portrait_upload on storage.objects for insert to authenticated
  with check (bucket_id='family-person-portraits'
    and split_part(storage.objects.name,'/',1)=(select auth.uid())::text
    and exists (select 1 from public.persons p join public.families f on f.id=p.family_id
      where p.id=nullif(split_part(storage.objects.name,'/',2),'')::uuid
        and f.owner_user_id=(select auth.uid())));

drop policy if exists family_person_portrait_read on storage.objects;
create policy family_person_portrait_read on storage.objects for select to authenticated
  using (bucket_id='family-person-portraits'
    and exists (select 1 from public.persons p join public.families f on f.id=p.family_id
      where p.portrait_storage_path=storage.objects.name
        and f.owner_user_id=(select auth.uid())));
