begin;
create function public.work_asset_readable(input_bucket text,input_name text) returns boolean
language sql stable security definer set search_path=public,auth as $$
 select exists (
  select 1 from voice_publications p join book_work_manifests w on w.id=p.work_manifest_id
  where w.confirmed_at is not null and public.can_manage_book_cover(p.book_project_id)
   and public.experience_data_allowed(p.book_project_id,false)
   and (
    (input_bucket='photos' and input_name in(p.snapshot_metadata#>>'{cover,cover_photo_path}',p.snapshot_metadata#>>'{cover,premium_cover_photo_path}'))
    or exists(select 1 from voice_publication_items i,
      lateral jsonb_array_elements(case when input_bucket='audio' then i.audio_assets
        when input_bucket='photos' then i.photo_assets else '[]'::jsonb end) asset
     where i.publication_id=p.id and asset->>'storagePath'=input_name)
   )
 );
$$;
revoke all on function public.work_asset_readable(text,text) from public,anon;
grant execute on function public.work_asset_readable(text,text) to authenticated;
create policy confirmed_work_asset_read on storage.objects for select to authenticated
using(public.work_asset_readable(bucket_id,name));
create policy fixed_work_no_insert on storage.objects as restrictive for insert to authenticated
with check(name not like 'published/%');
create policy fixed_work_no_update on storage.objects as restrictive for update to authenticated
using(name not like 'published/%') with check(name not like 'published/%');
create policy fixed_work_no_delete on storage.objects as restrictive for delete to authenticated
using(name not like 'published/%');
commit;
