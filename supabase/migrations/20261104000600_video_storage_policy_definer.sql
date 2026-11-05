-- The existing video Storage policy queried video_stories as authenticated,
-- although that table is intentionally not granted to clients. Keep the same
-- owner/manager conditions inside a narrow security-definer predicate.
create or replace function public.video_story_storage_allowed(input_path text)
returns boolean language sql stable security definer
set search_path = public, auth as $$
  select exists (
    select 1 from public.video_stories story
    where input_path in (story.video_storage_path, story.audio_storage_path,
      story.poster_storage_path)
      and public.can_manage_video_stories(story.book_project_id)
  );
$$;
revoke all on function public.video_story_storage_allowed(text) from public,anon;
grant execute on function public.video_story_storage_allowed(text) to authenticated;

drop policy if exists video_story_storage_select on storage.objects;
create policy video_story_storage_select on storage.objects
for select to authenticated using (
  bucket_id='videos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.video_story_storage_allowed(name)
  )
);
