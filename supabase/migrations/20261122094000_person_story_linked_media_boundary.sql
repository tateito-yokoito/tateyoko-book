-- A co-manager's legacy BOOK role must not reveal a newly linked keyed
-- Person story before the separately recorded Person-story consent.
begin;

create policy person_story_linked_media_select_guard on public.media_assets
  as restrictive for select to authenticated
  using (answer_id is null or public.person_story_linked_answer_readable(answer_id));
create policy person_story_linked_media_update_guard on public.media_assets
  as restrictive for update to authenticated
  using (answer_id is null or public.person_story_linked_answer_readable(answer_id))
  with check (answer_id is null or public.person_story_linked_answer_readable(answer_id));
create policy person_story_linked_video_select_guard on public.video_stories
  as restrictive for select to authenticated
  using (source_answer_id is null or public.person_story_linked_answer_readable(source_answer_id));

create function public.person_story_linked_storage_allowed(
  input_bucket text,input_path text
) returns boolean language sql volatile security definer
set search_path=public,storage,auth as $$
  select not exists (
    select 1 from public.media_assets m
    where input_bucket in ('audio','photos','videos')
      and m.storage_path=input_path
      and not public.person_story_linked_answer_readable(m.answer_id)
  ) and not exists (
    select 1 from public.video_stories v
    where input_bucket='videos'
      and input_path in (v.video_storage_path,v.audio_storage_path,v.poster_storage_path)
      and not public.person_story_linked_answer_readable(v.source_answer_id)
  ) and not exists (
    select 1 from public.answer_audio_archive archive
    where input_bucket='audio' and archive.storage_path=input_path
      and not public.person_story_linked_answer_readable(archive.answer_id)
  );
$$;
revoke all on function public.person_story_linked_storage_allowed(text,text)
  from public,anon;
grant execute on function public.person_story_linked_storage_allowed(text,text)
  to authenticated;
create policy person_story_linked_storage_select_guard on storage.objects
  as restrictive for select to authenticated
  using (public.person_story_linked_storage_allowed(bucket_id,name));

create or replace function public.get_co_manager_stories(input_book_project_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=public,auth as $$
declare result jsonb;
begin
  if not (public.is_project_co_manager(input_book_project_id) or exists (
    select 1 from public.book_projects bp where bp.id=input_book_project_id
      and bp.owner_user_id=auth.uid()))
    or not public.experience_data_allowed(input_book_project_id,false) then
    raise exception 'この物語を閲覧できません' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'answer_id',a.id,'sequence_order',a.sequence_order,
    'book_text',coalesce(nullif(a.transcript_edited,''),nullif(a.transcript_readable,''),
      nullif(a.transcript_clean,''),''),
    'created_at',a.created_at,'question_id',uq.question_id,
    'question_text',coalesce(uq.custom_question_text,uq.question_text_snapshot,''),
    'chapter_title',coalesce(uq.chapter_title_snapshot,uq.chapter,'その他'),
    'access_override',a.access_override
  ) order by a.sequence_order,a.created_at),'[]'::jsonb) into result
  from public.answers a left join public.user_questions uq on uq.id=a.user_question_id
  where a.book_project_id=input_book_project_id
    and public.person_story_linked_answer_readable(a.id);
  return result;
end;
$$;

create or replace function public.get_co_manager_media(input_book_project_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=public,auth as $$
declare result jsonb;
begin
  if not (public.is_project_co_manager(input_book_project_id) or exists (
    select 1 from public.book_projects bp where bp.id=input_book_project_id
      and bp.owner_user_id=auth.uid()))
    or not public.experience_data_allowed(input_book_project_id,false) then
    raise exception 'この物語を閲覧できません' using errcode='42501'; end if;
  select coalesce(jsonb_agg(item order by item->>'created_at'),'[]'::jsonb)
    into result from (
    select jsonb_build_object(
      'media_id',ma.id,'answer_id',ma.answer_id,'storage_path',ma.storage_path,
      'asset_type',ma.asset_type,'meta_json',ma.meta_json,'created_at',ma.created_at
    ) item
    from public.media_assets ma left join public.answers a on a.id=ma.answer_id
    where coalesce(ma.book_project_id,a.book_project_id)=input_book_project_id
      and ma.asset_type in ('photo','audio','video')
      and (ma.answer_id is null or public.person_story_linked_answer_readable(ma.answer_id))
    union all
    select jsonb_build_object(
      'media_id',vs.id,'answer_id',vs.source_answer_id,
      'storage_path',vs.video_storage_path,'asset_type','video',
      'meta_json',vs.metadata,'created_at',vs.created_at)
    from public.video_stories vs
    where vs.book_project_id=input_book_project_id
      and vs.video_storage_path is not null
      and (vs.source_answer_id is null or
        public.person_story_linked_answer_readable(vs.source_answer_id))
  ) items;
  return result;
end;
$$;

commit;
