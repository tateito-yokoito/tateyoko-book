begin;
-- A failed fixed-copy attempt must remain retryable. Record edits are allowed,
-- but bytes referenced by a confirmed work cannot be overwritten or deleted.
create function public.confirmed_work_uses_asset(input_bucket text,input_name text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from book_work_manifests w where w.confirmed_at is not null and (
  (input_bucket='photos' and input_name in(w.snapshot#>>'{cover,cover_photo_path}',w.snapshot#>>'{cover,premium_cover_photo_path}'))
  or exists(select 1 from jsonb_array_elements(w.snapshot->'media') m
    where m->>'storage_path'=input_name and
    ((input_bucket='photos' and m->>'asset_type'='photo') or (input_bucket='audio' and m->>'asset_type'='audio')))
  or (input_bucket='videos' and exists(select 1 from jsonb_array_elements(w.snapshot->'videos') v
    where input_name in(v->>'video_storage_path',v->>'audio_storage_path',v->>'poster_storage_path')))
 ));
$$;
revoke all on function public.confirmed_work_uses_asset(text,text) from public,anon;
grant execute on function public.confirmed_work_uses_asset(text,text) to authenticated;
create policy confirmed_source_no_update on storage.objects as restrictive for update to authenticated
using(not public.confirmed_work_uses_asset(bucket_id,name))
with check(not public.confirmed_work_uses_asset(bucket_id,name));
create policy confirmed_source_no_delete on storage.objects as restrictive for delete to authenticated
using(not public.confirmed_work_uses_asset(bucket_id,name));
commit;
