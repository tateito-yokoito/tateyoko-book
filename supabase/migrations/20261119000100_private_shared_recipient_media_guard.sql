-- A shared-story recipient may see only media attached to answers visible to
-- that recipient. The previous policy checked the project but not the answer.
-- Keep owner, authorized production, and supporter policies unchanged.
begin;

alter policy media_assets_shared_recipient_select
  on public.media_assets using (
    public.shared_story_recipient_can_view(book_project_id)
    and exists (
      select 1 from public.answers a
      where a.id = media_assets.answer_id
        and a.book_project_id = media_assets.book_project_id
        and a.access_override is distinct from 'private_forever'
    )
  );

commit;
