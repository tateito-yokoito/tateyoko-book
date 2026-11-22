-- Attach only conflict-free, active BOOK answers. Every free-media object
-- must already live in the matching BOOK bucket before any row is created.
begin;

create or replace function public.attach_person_story_to_book(
  input_project_id uuid,input_user_question_id uuid
) returns jsonb language plpgsql security definer set search_path=public,auth,storage as $$
declare
  p public.book_projects%rowtype;
  q public.user_questions%rowtype;
  s public.family_free_stories%rowtype;
  existing_id uuid;
  new_answer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select * into p from public.book_projects
    where id=input_project_id and status='active' for update;
  if p.id is null or p.owner_user_id<>auth.uid()
    or p.subject_person_id is null
    or p.access_status not in ('paid','gifted','legacy')
    or exists(select 1 from public.book_work_manifests w
      where w.book_project_id=p.id and w.confirmed_at is not null) then
    return jsonb_build_object('status','unavailable');
  end if;
  select * into q from public.user_questions
    where id=input_user_question_id and book_project_id=p.id
      and user_id=p.owner_user_id and is_active=true;
  if q.id is null or coalesce(q.meta_json->>'onboarding_group','')='trial_experience'
    or coalesce(q.meta_json->>'include_in_book_body','true')='false' then
    return jsonb_build_object('status','unavailable');
  end if;
  select l.answer_id into existing_id from public.person_story_book_links l
    where l.book_project_id=p.id and l.user_question_id=q.id;
  if existing_id is not null then
    return jsonb_build_object('status','linked','answer_id',existing_id);
  end if;
  select fs.* into s from public.family_free_stories fs
    join public.person_story_question_map m
      on m.story_question_key=fs.question_key and m.enabled
    where fs.person_id=p.subject_person_id
      and m.book_question_id=q.question_id
      and (nullif(btrim(fs.body),'') is not null or exists(
        select 1 from public.family_free_story_media fm where fm.story_id=fs.id))
    order by fs.created_at,fs.id limit 1 for update of fs;
  if s.id is null then return jsonb_build_object('status','no_story'); end if;
  if not public.family_free_story_can_read(s.id)
    or not public.family_free_story_can_write(s.id) then
    return jsonb_build_object('status','forbidden');
  end if;
  if exists(select 1 from public.family_free_story_media fm
      where fm.story_id=s.id and
        (fm.storage_bucket<>case when fm.asset_type='photo' then 'photos' else 'audio' end
         or not exists(select 1 from storage.objects o
           where o.bucket_id=fm.storage_bucket and o.name=fm.storage_path))) then
    return jsonb_build_object('status','media_pending');
  end if;
  if exists(select 1 from public.answers a where a.book_project_id=p.id
      and (a.user_question_id=q.id or
        (a.user_id=p.owner_user_id and a.sequence_order=q.sequence_order))) then
    return jsonb_build_object('status','conflict');
  end if;
  insert into public.answers(
    user_id,book_project_id,speaker_person_id,subject_person_id,
    user_question_id,question_id,sequence_order,
    transcript_clean,transcript_readable,transcript_edited,access_override
  ) values (
    p.owner_user_id,p.id,p.subject_person_id,p.subject_person_id,
    q.id,q.question_id,q.sequence_order,
    s.body,s.body,s.body,
    case when s.visibility='private' then 'private_forever' else 'inherit' end
  ) returning id into new_answer_id;
  insert into public.person_story_book_links
    (book_project_id,user_question_id,story_id,answer_id)
  values (p.id,q.id,s.id,new_answer_id);
  insert into public.media_assets
    (answer_id,user_id,family_id,book_project_id,person_id,
     asset_type,storage_path,meta_json)
  select new_answer_id,p.owner_user_id,s.family_id,p.id,s.person_id,
    fm.asset_type,fm.storage_path,
    jsonb_build_object('duration_seconds',fm.duration_seconds,
      'person_story_media_id',fm.id)
  from public.family_free_story_media fm
  where fm.story_id=s.id
  on conflict (answer_id,asset_type,storage_path) do nothing;
  update public.user_questions set status='answered',
    answered_at=coalesce(answered_at,now()) where id=q.id;
  return jsonb_build_object('status','linked','answer_id',new_answer_id);
end;
$$;

commit;
