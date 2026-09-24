begin;

-- This is a source-ownership assertion for the service-role publication worker,
-- not a general-purpose Storage read permission. The worker separately checks
-- the actor's project/experience rights and (for managed families) consent.
create or replace function public.publication_source_asset_allowed(
  input_project uuid, input_bucket text, input_path text,
  input_kind text, input_source uuid
) returns boolean
language plpgsql stable security definer
set search_path = public, storage
as $$
declare
  target public.book_projects%rowtype;
  asset public.media_assets%rowtype;
  answer_row public.answers%rowtype;
  video_row public.video_stories%rowtype;
  path_actor uuid;
  path_parts text[];
  expected_path_prefix text;
begin
  if input_project is null or input_source is null or input_path is null
    or input_path = '' or input_path like 'published/%'
    or input_path like '%..%' or input_path like '%//%' then return false; end if;
  select * into target from public.book_projects where id = input_project;
  if target.id is null or target.subject_person_id is null then return false; end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = input_bucket and name = input_path
      and coalesce((metadata->>'size')::bigint, 0) > 0
  ) then return false; end if;

  if input_kind in ('audio', 'photo') then
    if input_bucket <> (case when input_kind = 'audio' then 'audio' else 'photos' end) then return false; end if;
    select * into asset from public.media_assets where id = input_source;
    if asset.id is null or asset.asset_type <> input_kind
      or asset.storage_path is distinct from input_path
      or asset.book_project_id is distinct from input_project
      or asset.person_id is distinct from target.subject_person_id
      or (asset.family_id is not null and asset.family_id is distinct from target.family_id)
      or asset.answer_id is null then return false; end if;
    select * into answer_row from public.answers where id = asset.answer_id;
    if answer_row.id is null or answer_row.book_project_id is distinct from input_project
      or answer_row.subject_person_id is distinct from target.subject_person_id
      or not (
        (answer_row.user_question_id is not null and exists (select 1 from public.user_questions q
          where q.id = answer_row.user_question_id and q.book_project_id = input_project))
        or (answer_row.user_question_id is null and answer_row.question_id is not null
          and exists (select 1 from public.questions q where q.id = answer_row.question_id))
      )
    then return false; end if;
    -- A source path may not be reused by a second answer/project, even if a
    -- forged metadata row points at it.
    if exists (select 1 from public.media_assets other
      where other.storage_path = input_path and other.id <> asset.id
        and (other.answer_id is distinct from asset.answer_id
          or other.book_project_id is distinct from input_project
          or other.person_id is distinct from target.subject_person_id)) then return false; end if;
    if input_path like 'family/%' then
      return exists (select 1 from public.family_uploads u
        where u.path = input_path and u.project_id = input_project
          and u.answer_id = answer_row.id and u.committed_at is not null
          and u.kind = input_kind
          and input_path like 'family/' || input_project::text || '/' || u.actor_id::text || '/' || u.id::text || '.%');
    end if;
    path_parts := string_to_array(input_path, '/');
    if array_length(path_parts, 1) < 3 or path_parts[1] !~* '^[0-9a-f-]{36}$' then return false; end if;
    path_actor := path_parts[1]::uuid;
    if path_actor <> target.owner_user_id and not exists (
      select 1 from public.project_supporters s where s.book_project_id = input_project
        and s.supporter_user_id = path_actor and s.status = 'active'
    ) then return false; end if;
    -- Both legacy account/answer and current account/project/answer uploads.
    if not (input_path like path_actor::text || '/' || answer_row.id::text || '/%'
      or input_path like path_actor::text || '/' || input_project::text || '/' || answer_row.id::text || '/%')
    then return false; end if;
    return true;
  end if;

  if input_kind in ('video', 'video_audio', 'video_poster') then
    if input_bucket <> 'videos' then return false; end if;
    select * into video_row from public.video_stories where id = input_source;
    if video_row.id is null or video_row.book_project_id is distinct from input_project
      or video_row.subject_person_id is distinct from target.subject_person_id
      or video_row.status <> 'ready' then return false; end if;
    if input_path is distinct from (case input_kind
      when 'video' then video_row.video_storage_path
      when 'video_audio' then video_row.audio_storage_path
      else video_row.poster_storage_path end) then return false; end if;
    expected_path_prefix := video_row.created_by_user_id::text || '/'
      || input_project::text || '/' || video_row.id::text || '/';
    if input_path not like expected_path_prefix || '%' then return false; end if;
    if video_row.created_by_user_id <> target.owner_user_id and not exists (
      select 1 from public.project_supporters s where s.book_project_id = input_project
        and s.supporter_user_id = video_row.created_by_user_id and s.status = 'active'
    ) then return false; end if;
    if video_row.source_answer_id is not null and not exists (
      select 1 from public.answers a where a.id = video_row.source_answer_id
        and a.book_project_id = input_project and a.subject_person_id = target.subject_person_id
    ) then return false; end if;
    if exists (select 1 from public.video_stories other where other.id <> video_row.id
      and input_path in (other.video_storage_path, other.audio_storage_path, other.poster_storage_path))
    then return false; end if;
    return true;
  end if;

  if input_kind in ('cover', 'premium_cover') then
    if input_bucket <> 'photos' or input_source <> input_project then return false; end if;
    if input_path not like 'book-covers/' || input_project::text || '/%' then return false; end if;
    if not exists (select 1 from public.book_cover_settings c
      where c.book_project_id = input_project and input_path = (case input_kind
        when 'cover' then c.cover_photo_path else c.premium_cover_photo_path end))
    then return false; end if;
    if exists (select 1 from public.book_cover_settings c
      where c.book_project_id <> input_project and input_path in (c.cover_photo_path, c.premium_cover_photo_path))
    then return false; end if;
    return true;
  end if;
  return false;
exception when others then
  -- Invalid casts, missing catalog state, or any uncertainty deny publication.
  return false;
end;
$$;

revoke all on function public.publication_source_asset_allowed(uuid,text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.publication_source_asset_allowed(uuid,text,text,text,uuid)
  to service_role;

commit;
