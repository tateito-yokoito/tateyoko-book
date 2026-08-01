begin;

drop policy if exists story_recipients_media_read on storage.objects;
create policy story_recipients_media_read
on storage.objects for select to authenticated
using (
  bucket_id in ('photos', 'audio')
  and exists (
    select 1
    from public.media_assets ma
    join public.answers a on a.id = ma.answer_id
    where ma.storage_path = storage.objects.name
      and ma.asset_type = case when storage.objects.bucket_id = 'photos' then 'photo' else 'audio' end
      and a.access_override <> 'private_forever'
      and public.shared_story_recipient_can_view(ma.book_project_id)
  )
);

commit;
