-- Keep the editable photo source alongside the displayed square crop.
-- Existing portraits have no source path and remain available unchanged.
alter table public.persons add column if not exists portrait_source_storage_path text;

drop policy if exists family_person_portrait_read on storage.objects;
create policy family_person_portrait_read on storage.objects for select to authenticated
  using (bucket_id='family-person-portraits'
    and exists (select 1 from public.persons p join public.families f on f.id=p.family_id
      where f.owner_user_id=(select auth.uid())
        and (p.portrait_storage_path=storage.objects.name
          or (p.portrait_source_storage_path=storage.objects.name
            and split_part(storage.objects.name,'/',2)=p.id::text))));

drop policy if exists family_person_portrait_discard on storage.objects;
create policy family_person_portrait_discard on storage.objects for delete to authenticated
  using (bucket_id='family-person-portraits'
    and split_part(storage.objects.name,'/',1)=(select auth.uid())::text
    and not exists (select 1 from public.persons p
      where p.portrait_storage_path=storage.objects.name
        or p.portrait_source_storage_path=storage.objects.name));
