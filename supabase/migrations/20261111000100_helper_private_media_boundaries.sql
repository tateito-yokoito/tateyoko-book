-- Apply after shared_v2_book_completion. This changes only helper read/write
-- boundaries; owners, Gift B creators and co-managers retain their access.
begin;

create or replace function public.book_role_is_helper(
  input_project_id uuid, input_actor_id uuid default auth.uid()
) returns boolean language sql stable security definer
set search_path=public,auth as $$
  select input_actor_id is not null
    and exists (select 1 from public.project_supporters ps
      where ps.book_project_id=input_project_id
        and ps.supporter_user_id=input_actor_id and ps.status='active'
        and coalesce(ps.meta_json->>'support_role','helper') not in ('facilitator','co_manager'))
    and not exists (select 1 from public.book_projects bp
      where bp.id=input_project_id and bp.owner_user_id=input_actor_id)
    and not coalesce(public.family_creator(input_project_id,input_actor_id),false)
    and not coalesce(public.is_project_co_manager(input_project_id,input_actor_id),false);
$$;
revoke all on function public.book_role_is_helper(uuid,uuid) from public,anon;
grant execute on function public.book_role_is_helper(uuid,uuid) to authenticated,service_role;

-- Restrictive policies also close legacy owner/uploader permissive policies
-- when a helper's own answer or file is later made private by a manager.
create policy helper_private_answer_select_guard on public.answers
  as restrictive for select to authenticated
  using (not public.book_role_is_helper(book_project_id)
    or access_override is distinct from 'private_forever');
create policy helper_private_answer_update_guard on public.answers
  as restrictive for update to authenticated
  using (not public.book_role_is_helper(book_project_id)
    or access_override is distinct from 'private_forever')
  with check (not public.book_role_is_helper(book_project_id)
    or access_override is distinct from 'private_forever');
create policy helper_private_answer_insert_guard on public.answers
  as restrictive for insert to authenticated
  with check (not public.book_role_is_helper(book_project_id)
    or access_override is distinct from 'private_forever');

create or replace function public.helper_answer_media_allowed(
  input_project_id uuid,input_answer_id uuid
) returns boolean language sql stable security definer
set search_path=public,auth as $$
  select not public.book_role_is_helper(input_project_id)
    or (input_answer_id is not null and exists (
      select 1 from public.answers a where a.id=input_answer_id
        and a.book_project_id=input_project_id
        and a.access_override is distinct from 'private_forever'));
$$;
revoke all on function public.helper_answer_media_allowed(uuid,uuid) from public,anon;
grant execute on function public.helper_answer_media_allowed(uuid,uuid) to authenticated,service_role;

create policy helper_private_media_select_guard on public.media_assets
  as restrictive for select to authenticated
  using (public.helper_answer_media_allowed(book_project_id,answer_id));
create policy helper_private_media_update_guard on public.media_assets
  as restrictive for update to authenticated
  using (public.helper_answer_media_allowed(book_project_id,answer_id))
  with check (public.helper_answer_media_allowed(book_project_id,answer_id));
create policy helper_private_media_insert_guard on public.media_assets
  as restrictive for insert to authenticated
  with check (public.helper_answer_media_allowed(book_project_id,answer_id));
create policy helper_private_media_delete_guard on public.media_assets
  as restrictive for delete to authenticated
  using (public.helper_answer_media_allowed(book_project_id,answer_id));

create policy helper_private_video_select_guard on public.video_stories
  as restrictive for select to authenticated
  using (source_answer_id is null or
    public.helper_answer_media_allowed(book_project_id,source_answer_id));
create policy helper_private_video_update_guard on public.video_stories
  as restrictive for update to authenticated
  using (source_answer_id is null or
    public.helper_answer_media_allowed(book_project_id,source_answer_id))
  with check (source_answer_id is null or
    public.helper_answer_media_allowed(book_project_id,source_answer_id));
create policy helper_private_video_insert_guard on public.video_stories
  as restrictive for insert to authenticated
  with check (source_answer_id is null or
    public.helper_answer_media_allowed(book_project_id,source_answer_id));
create policy helper_private_video_delete_guard on public.video_stories
  as restrictive for delete to authenticated
  using (source_answer_id is null or
    public.helper_answer_media_allowed(book_project_id,source_answer_id));

-- Storage has broad own-path SELECT policies. The restrictive guard checks
-- metadata after upload, including video/audio/poster paths for one video.
create or replace function public.helper_storage_private_allowed(
  input_bucket text,input_path text
) returns boolean language sql stable security definer
set search_path=public,auth as $$
  select not exists (
    select 1 from public.media_assets m
    join public.answers a on a.id=m.answer_id
    where input_bucket in ('audio','photos','videos')
      and m.storage_path=input_path
      and public.book_role_is_helper(a.book_project_id)
      and a.access_override='private_forever'
  ) and not exists (
    select 1 from public.answer_audio_archive archive
    join public.answers a on a.id=archive.answer_id
    where input_bucket='audio' and archive.storage_path=input_path
      and public.book_role_is_helper(a.book_project_id)
      and a.access_override='private_forever'
  ) and not exists (
    select 1 from public.video_stories v
    join public.answers a on a.id=v.source_answer_id
    where input_bucket='videos'
      and input_path in (v.video_storage_path,v.audio_storage_path,v.poster_storage_path)
      and public.book_role_is_helper(v.book_project_id)
      and a.access_override='private_forever'
  );
$$;
revoke all on function public.helper_storage_private_allowed(text,text) from public,anon;
grant execute on function public.helper_storage_private_allowed(text,text) to authenticated,service_role;
create policy helper_storage_private_select_guard on storage.objects
  as restrictive for select to authenticated
  using (public.helper_storage_private_allowed(bucket_id,name));
create policy helper_storage_private_update_guard on storage.objects
  as restrictive for update to authenticated
  using (public.helper_storage_private_allowed(bucket_id,name))
  with check (public.helper_storage_private_allowed(bucket_id,name));
create policy helper_storage_private_delete_guard on storage.objects
  as restrictive for delete to authenticated
  using (public.helper_storage_private_allowed(bucket_id,name));

-- The existing SECURITY DEFINER work RPC returned an unfiltered snapshot.
-- Filter it at the same boundary for helpers, including media and videos.
create or replace function public.get_book_work(input_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare w public.book_work_manifests%rowtype; ids uuid[]; safe_ids uuid[]; result jsonb;
begin
  if public.can_manage_book_cover(input_project_id) is distinct from true
    or public.experience_data_allowed(input_project_id,false) is distinct from true then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  select * into w from public.book_work_manifests where book_project_id=input_project_id;
  if w.id is null then
    select coalesce(array_agg(a.id order by a.sequence_order,a.created_at),'{}') into ids
    from public.answers a left join public.user_questions q on q.id=a.user_question_id
    join public.book_projects p on p.id=a.book_project_id
    where a.book_project_id=input_project_id and a.subject_person_id=p.subject_person_id
      and a.access_override is distinct from 'private_forever'
      and coalesce(q.meta_json->>'onboarding_group','')<>'trial_experience'
      and coalesce(q.meta_json->>'include_in_book_body','true')<>'false';
    return jsonb_build_object('answer_ids',ids,'revision',0,'confirmed_at',null);
  end if;
  if public.book_role_is_helper(input_project_id) then
    select coalesce(array_agg(a.id order by array_position(w.answer_ids,a.id)),'{}')
      into safe_ids from public.answers a
      where a.id=any(w.answer_ids) and a.book_project_id=input_project_id
        and a.access_override is distinct from 'private_forever';
    result:=to_jsonb(w)-'snapshot'||jsonb_build_object(
      'answer_ids',safe_ids,'publication',null);
    if w.snapshot is not null then
      result:=result||jsonb_build_object('snapshot',jsonb_build_object(
        'project',w.snapshot->'project','cover',w.snapshot->'cover',
        'subject',w.snapshot->'subject',
        'answers',(select coalesce(jsonb_agg(item),'[]'::jsonb)
          from jsonb_array_elements(coalesce(w.snapshot->'answers','[]'::jsonb)) item
          where item->>'id'=any(select x::text from unnest(safe_ids) x)),
        'questions',(select coalesce(jsonb_agg(item),'[]'::jsonb)
          from jsonb_array_elements(coalesce(w.snapshot->'questions','[]'::jsonb)) item
          where item->>'id' in (select a.user_question_id::text from public.answers a
            where a.id=any(safe_ids))),
        'media',(select coalesce(jsonb_agg(item),'[]'::jsonb)
          from jsonb_array_elements(coalesce(w.snapshot->'media','[]'::jsonb)) item
          where item->>'answer_id'=any(select x::text from unnest(safe_ids) x)),
        'videos',(select coalesce(jsonb_agg(item),'[]'::jsonb)
          from jsonb_array_elements(coalesce(w.snapshot->'videos','[]'::jsonb)) item
          where item->>'source_answer_id' is null
            or item->>'source_answer_id'=any(select x::text from unnest(safe_ids) x))));
    end if;
    return result;
  end if;
  return to_jsonb(w)||jsonb_build_object('publication',(
    select to_jsonb(p)||jsonb_build_object('items',(
      select jsonb_agg(to_jsonb(i) order by i.item_order)
      from public.voice_publication_items i where i.publication_id=p.id))
    from public.voice_publications p where p.work_manifest_id=w.id));
end;
$$;

-- Helpers may arrange visible entries, but cannot infer, remove or return
-- private entries already chosen by the manager.
create or replace function public.save_book_selection(
  input_project_id uuid,input_answer_ids uuid[],input_expected_revision integer
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare w public.book_work_manifests%rowtype; person uuid; selected_ids uuid[];
begin
  if public.can_manage_book_cover(input_project_id) is distinct from true then
    raise exception 'Forbidden' using errcode='42501'; end if;
  perform public.assert_experience_processing(input_project_id,auth.uid());
  select subject_person_id into person from public.book_projects
    where id=input_project_id for update;
  insert into public.book_work_manifests(book_project_id) values(input_project_id)
    on conflict do nothing;
  select * into w from public.book_work_manifests
    where book_project_id=input_project_id for update;
  if w.confirmed_at is not null then raise exception 'This work is already confirmed'; end if;
  if w.revision is distinct from input_expected_revision then
    raise exception 'Selection changed; reload before saving'; end if;
  if input_answer_ids is null
    or cardinality(input_answer_ids)<>(select count(distinct x) from unnest(input_answer_ids) x)
    or exists(select 1 from unnest(input_answer_ids) x where not exists (
      select 1 from public.answers a where a.id=x
        and a.book_project_id=input_project_id and a.subject_person_id=person
        and (public.family_managed(input_project_id)
          or a.access_override is distinct from 'private_forever'))) then
    raise exception 'Invalid work selection'; end if;
  selected_ids:=input_answer_ids;
  if public.book_role_is_helper(input_project_id) then
    if exists(select 1 from unnest(input_answer_ids) x
      join public.answers a on a.id=x where a.access_override='private_forever') then
      raise exception '非公開の語りを選べません' using errcode='42501'; end if;
    select coalesce(array_agg(x order by n),'{}'::uuid[])||input_answer_ids
      into selected_ids from unnest(w.answer_ids) with ordinality t(x,n)
      join public.answers a on a.id=x where a.access_override='private_forever';
  end if;
  update public.book_work_manifests set answer_ids=selected_ids,revision=revision+1
    where book_project_id=input_project_id returning * into w;
  if public.book_role_is_helper(input_project_id) then
    return public.get_book_work(input_project_id); end if;
  return to_jsonb(w);
end;
$$;

-- The original direct-confirm RPC remains available to managers for legacy
-- work, but a helper must not use it to obtain an unfiltered final snapshot.
create or replace function public.confirm_book_work(
  input_project_id uuid,input_expected_revision integer,input_subject_confirmed boolean
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare w public.book_work_manifests%rowtype; payload jsonb;
begin
  if public.book_role_is_helper(input_project_id)
    or public.can_manage_book_cover(input_project_id) is distinct from true
    or input_subject_confirmed is distinct from true then
    raise exception 'Subject confirmation required' using errcode='42501'; end if;
  perform public.assert_experience_processing(input_project_id,auth.uid());
  perform 1 from public.book_projects where id=input_project_id for update;
  select * into w from public.book_work_manifests
    where book_project_id=input_project_id for update;
  if w.id is null then raise exception 'Save selection first'; end if;
  if w.confirmed_at is not null then return to_jsonb(w); end if;
  if w.revision is distinct from input_expected_revision or cardinality(w.answer_ids)=0 then
    raise exception 'Review the selected stories'; end if;
  if exists(select 1 from unnest(w.answer_ids) x where not exists(
    select 1 from public.answers a join public.book_projects p on p.id=a.book_project_id
    where a.id=x and a.book_project_id=input_project_id
      and a.subject_person_id=p.subject_person_id
      and (public.family_managed(input_project_id)
        or a.access_override is distinct from 'private_forever'))) then
    raise exception 'Selection no longer available'; end if;
  if exists(select 1 from public.video_stories where book_project_id=input_project_id
    and (status='processing' or metadata->>'upload_complete'='false')) then
    raise exception 'Finish video uploads first'; end if;
  select jsonb_build_object(
    'project',to_jsonb(p),
    'cover',(select to_jsonb(c) from public.book_cover_settings c where c.book_project_id=p.id),
    'subject',(select to_jsonb(s) from public.persons s where s.id=p.subject_person_id),
    'answers',(select coalesce(jsonb_agg(to_jsonb(a) order by array_position(w.answer_ids,a.id)),'[]'::jsonb)
      from public.answers a where a.id=any(w.answer_ids)),
    'questions',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb)
      from public.user_questions q where q.id in
        (select user_question_id from public.answers where id=any(w.answer_ids))),
    'media',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at),'[]'::jsonb)
      from public.media_assets m where m.answer_id=any(w.answer_ids) and m.book_project_id=p.id),
    'videos',(select coalesce(jsonb_agg(to_jsonb(v) order by v.slot_order),'[]'::jsonb)
      from public.video_stories v where v.book_project_id=p.id and v.status in('ready','failed'))
  ) into payload from public.book_projects p where p.id=input_project_id;
  update public.book_work_manifests set snapshot=payload,
    confirmed_at=now(),confirmed_by=auth.uid()
    where id=w.id returning * into w;
  return to_jsonb(w);
end;
$$;

commit;
