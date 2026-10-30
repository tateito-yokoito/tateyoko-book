begin;

create or replace function public.archive_current_answer_audio(input_answer_id uuid,input_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.answer_audio_archive
    (source_media_id,answer_id,user_id,storage_path,meta_json,original_created_at)
  select id,answer_id,user_id,storage_path,coalesce(meta_json,'{}'::jsonb),created_at
  from public.media_assets where answer_id=input_answer_id
    and user_id=input_user_id and asset_type='audio'
  on conflict(source_media_id) do nothing;
  update public.media_assets set asset_type='audio_archived'
    where answer_id=input_answer_id and user_id=input_user_id and asset_type='audio';
end; $$;
revoke all on function public.archive_current_answer_audio(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.archive_current_answer_audio(uuid,uuid) to service_role;

-- Existing permissive sharing policies still apply to current assets; archived
-- audio metadata is visible only to its owner.
create policy answer_archived_audio_private on public.media_assets
  as restrictive for select to public
  using (asset_type <> 'audio_archived' or user_id = (select auth.uid()));

create policy answer_archived_audio_file_owner on storage.objects
  for select to authenticated using (
    bucket_id='audio' and exists (
      select 1 from public.answer_audio_archive archive
      where archive.storage_path=objects.name and archive.user_id=(select auth.uid())
    )
  );

commit;
