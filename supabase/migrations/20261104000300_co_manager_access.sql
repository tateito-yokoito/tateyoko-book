-- Co-managers may read the entire project, including private answers.
-- Helpers keep their existing shared-only RPC and storage access.
create policy co_manager_project_read on public.book_projects
  for select to authenticated using (public.is_project_co_manager(id));
create policy co_manager_questions_read on public.user_questions
  for select to authenticated using (public.is_project_co_manager(book_project_id));
create policy co_manager_answers_read on public.answers
  for select to authenticated using (public.is_project_co_manager(book_project_id));

-- Storage can only sign an object that belongs to a co-managed project.
-- A broad media_assets table grant is deliberately avoided: legacy recipient
-- policies were written for server-side RPC access rather than direct SELECT.
create or replace function public.co_manager_can_read_object(
  input_bucket text,input_path text
) returns boolean language sql stable security definer
set search_path = public, storage, auth as $$
  with associated_projects as (
    select coalesce(ma.book_project_id,a.book_project_id) project_id
    from public.media_assets ma left join public.answers a on a.id=ma.answer_id
    where ma.storage_path=input_path and ma.asset_type=case
      when input_bucket='photos' then 'photo'
      when input_bucket='audio' then 'audio'
      else 'video' end
    union all
    select vs.book_project_id from public.video_stories vs
    where input_bucket='videos' and input_path in
      (vs.video_storage_path,vs.audio_storage_path,vs.poster_storage_path)
  )
  select input_bucket in ('audio','photos','videos')
    and count(*)>0
    and coalesce(bool_and(public.is_project_co_manager(project_id)
      and public.experience_data_allowed(project_id,false)),false)
  from associated_projects;
$$;
revoke all on function public.co_manager_can_read_object(text,text) from public,anon;
grant execute on function public.co_manager_can_read_object(text,text) to authenticated;

create policy co_manager_project_media_read on storage.objects
  for select to authenticated using (
    public.co_manager_can_read_object(bucket_id,name)
  );

create or replace function public.get_co_manager_stories(input_book_project_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, auth as $$
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
  where a.book_project_id=input_book_project_id;
  return result;
end;
$$;

create or replace function public.get_co_manager_media(input_book_project_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, auth as $$
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
    union all
    select jsonb_build_object(
      'media_id',vs.id,'answer_id',vs.source_answer_id,
      'storage_path',vs.video_storage_path,'asset_type','video',
      'meta_json',vs.metadata,'created_at',vs.created_at
    ) from public.video_stories vs
    where vs.book_project_id=input_book_project_id
      and vs.video_storage_path is not null
  ) items;
  return result;
end;
$$;

create or replace function public.update_co_manager_story(
  input_answer_id uuid,input_book_text text,input_private boolean
) returns boolean language plpgsql security definer
set search_path = public, auth as $$
declare target_project_id uuid;
begin
  select book_project_id into target_project_id from public.answers
    where id=input_answer_id for update;
  if target_project_id is null or not (public.is_project_co_manager(target_project_id) or exists (
    select 1 from public.book_projects bp where bp.id=target_project_id
      and bp.owner_user_id=auth.uid()))
    or not public.experience_data_allowed(target_project_id,true) then
    raise exception 'この語りを編集できません' using errcode='42501'; end if;
  if length(coalesce(input_book_text,'')) > 50000 then
    raise exception '文章が長すぎます' using errcode='22023'; end if;
  update public.answers set transcript_edited=input_book_text,
    access_override=case when input_private then 'private_forever' else 'inherit' end
    where id=input_answer_id;
  return true;
end;
$$;

create or replace function public.set_co_manager_sharing(
  input_book_project_id uuid,input_live_scope text
) returns boolean language plpgsql security definer
set search_path = public, auth as $$
begin
  if not (public.is_project_co_manager(input_book_project_id) or exists (
    select 1 from public.book_projects bp where bp.id=input_book_project_id
      and bp.owner_user_id=auth.uid()))
    or not public.experience_data_allowed(input_book_project_id,true) then
    raise exception '共有設定を変更できません' using errcode='42501'; end if;
  if input_live_scope not in ('private','family','selected') then
    raise exception '共有範囲を確認できません' using errcode='22023'; end if;
  insert into public.story_sharing_preferences (
    book_project_id,live_scope,family_sharing_enabled,selected_sharing_enabled
  ) values (
    input_book_project_id,input_live_scope,
    input_live_scope='family',input_live_scope='selected'
  ) on conflict (book_project_id) do update set
    live_scope=excluded.live_scope,
    family_sharing_enabled=excluded.family_sharing_enabled,
    selected_sharing_enabled=excluded.selected_sharing_enabled,
    updated_at=now();
  return true;
end;
$$;

create or replace function public.get_co_manager_sharing(input_book_project_id uuid)
returns text language plpgsql stable security definer
set search_path = public, auth as $$
declare result text;
begin
  if not (public.is_project_co_manager(input_book_project_id) or exists (
    select 1 from public.book_projects bp where bp.id=input_book_project_id
      and bp.owner_user_id=auth.uid())) then
    raise exception '共有設定を確認できません' using errcode='42501'; end if;
  select live_scope into result from public.story_sharing_preferences
    where book_project_id=input_book_project_id;
  return coalesce(result,'private');
end;
$$;

revoke all on function public.get_co_manager_stories(uuid) from public,anon;
revoke all on function public.get_co_manager_media(uuid) from public,anon;
revoke all on function public.update_co_manager_story(uuid,text,boolean) from public,anon;
revoke all on function public.set_co_manager_sharing(uuid,text) from public,anon;
revoke all on function public.get_co_manager_sharing(uuid) from public,anon;
grant execute on function public.get_co_manager_stories(uuid) to authenticated;
grant execute on function public.get_co_manager_media(uuid) to authenticated;
grant execute on function public.update_co_manager_story(uuid,text,boolean) to authenticated;
grant execute on function public.set_co_manager_sharing(uuid,text) to authenticated;
grant execute on function public.get_co_manager_sharing(uuid) to authenticated;
