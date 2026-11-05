-- Existing Storage policies query private metadata tables directly, but client
-- roles do not have those table grants. Preserve each predicate behind a narrow
-- security-definer function; do not grant direct access to media_assets.
create or replace function public.story_recipient_media_object_allowed(input_bucket text,input_path text)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select input_bucket in ('photos','audio') and exists (
    select 1 from public.media_assets ma join public.answers a on a.id=ma.answer_id
    where ma.storage_path=input_path
      and ma.asset_type=case when input_bucket='photos' then 'photo' else 'audio' end
      and a.access_override <> 'private_forever'
      and public.shared_story_recipient_can_view(ma.book_project_id)
  );
$$;
create or replace function public.supporter_photo_object_allowed(input_path text)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists (
    select 1 from public.media_assets ma
    join public.answers a on a.id=ma.answer_id
    join public.project_supporters ps on ps.book_project_id=a.book_project_id
    where ma.storage_path=input_path and ma.asset_type='photo'
      and coalesce(a.access_override,'inherit') <> 'private_forever'
      and ps.supporter_user_id=auth.uid() and ps.status='active'
      and (ps.can_manage_photos or ps.can_edit_book_text or ps.can_build_book)
      and public.supporter_can_view_shared_story(a.book_project_id)
  );
$$;
create or replace function public.owner_supporter_audio_object_allowed(input_path text)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists (
    select 1 from public.media_assets ma
    join public.answers a on a.id=ma.answer_id
    join public.book_projects bp on bp.id=a.book_project_id
    where ma.storage_path=input_path and ma.asset_type='audio'
      and (bp.owner_user_id=auth.uid() or (
        public.supporter_can_view_shared_story(bp.id) and exists (
          select 1 from public.project_supporters ps
          where ps.book_project_id=bp.id and ps.supporter_user_id=auth.uid()
            and ps.status='active' and ps.can_view_raw_audio
        )))
  );
$$;
revoke all on function public.story_recipient_media_object_allowed(text,text) from public,anon;
revoke all on function public.supporter_photo_object_allowed(text) from public,anon;
revoke all on function public.owner_supporter_audio_object_allowed(text) from public,anon;
grant execute on function public.story_recipient_media_object_allowed(text,text) to authenticated;
grant execute on function public.supporter_photo_object_allowed(text) to authenticated;
grant execute on function public.owner_supporter_audio_object_allowed(text) to authenticated;

drop policy if exists story_recipients_media_read on storage.objects;
create policy story_recipients_media_read on storage.objects for select to authenticated
using (bucket_id in ('photos','audio') and public.story_recipient_media_object_allowed(bucket_id,name));
drop policy if exists photos_supporter_read on storage.objects;
create policy photos_supporter_read on storage.objects for select to authenticated
using (bucket_id='photos' and public.supporter_photo_object_allowed(name));
drop policy if exists audio_project_owner_supporter_read on storage.objects;
create policy audio_project_owner_supporter_read on storage.objects for select to authenticated
using (bucket_id='audio' and public.owner_supporter_audio_object_allowed(name));
