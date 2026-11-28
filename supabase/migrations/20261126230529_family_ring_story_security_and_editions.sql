-- Keep the BOOK edition immutable while giving the person's year ring its
-- own revision after confirmation. No existing answer or publication is copied.
begin;

create table public.family_ring_story_editions (
  answer_id uuid primary key references public.answers(id) on delete restrict,
  book_project_id uuid not null references public.book_projects(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  body text not null,
  visibility text not null check (visibility in ('private','family')),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
create index family_ring_story_editions_person_idx
  on public.family_ring_story_editions(person_id);
alter table public.family_ring_story_editions enable row level security;
revoke all on public.family_ring_story_editions from public,anon,authenticated;

create function public.family_ring_is_self(input_person_id uuid)
returns boolean language sql stable security definer
set search_path=public,auth as $$
  select auth.uid() is not null and exists (
    select 1 from public.user_person_links l
    where l.person_id=input_person_id and l.user_id=auth.uid() and l.role='self');
$$;
revoke all on function public.family_ring_is_self(uuid) from public,anon;
grant execute on function public.family_ring_is_self(uuid) to authenticated;

-- The previous OR allowed a co-manager to read a private free story. Keep
-- private outside the family/co-manager branches so direct REST and media
-- access use exactly the same boundary as the UI.
create or replace function public.family_free_story_can_read(input_story_id uuid)
returns boolean language sql volatile security definer
set search_path=public,auth as $$
  select public.family_place_access_allowed() and exists (
    select 1 from public.family_free_stories s
    join public.families f on f.id=s.family_id
    join public.persons p on p.id=s.person_id and p.family_id=s.family_id
    where s.id=input_story_id and (
      (s.visibility='private' and public.family_ring_is_self(s.person_id))
      or (s.visibility='family' and (
        f.owner_user_id=auth.uid()
        or public.family_ring_is_self(s.person_id)
        or public.person_story_co_manager_allowed(s.person_id)))
    ));
$$;

-- The subject can correct their own free story even when someone else
-- created the initial record. This does not grant co-managers a private read.
create or replace function public.family_free_story_can_write(input_story_id uuid)
returns boolean language sql volatile security definer
set search_path=public,auth as $$
  select public.family_place_access_allowed() and exists (
    select 1 from public.family_free_stories s
    join public.families f on f.id=s.family_id
    join public.persons p on p.id=s.person_id and p.family_id=s.family_id
    where s.id=input_story_id and (
      public.family_ring_is_self(s.person_id)
      or (s.visibility='family' and (
        (s.created_by=auth.uid() and f.owner_user_id=auth.uid())
        or public.person_story_co_manager_allowed(s.person_id)))
    ));
$$;

create function public.family_ring_answer_readable(input_answer_id uuid)
returns boolean language sql volatile security definer
set search_path=public,auth as $$
  select not exists (
    select 1 from public.answers a
    left join public.family_ring_story_editions e on e.answer_id=a.id
    where a.id=input_answer_id
      and a.subject_person_id is not null
      and (a.access_override='private_forever' or e.visibility='private')
      and not public.family_ring_is_self(a.subject_person_id));
$$;
revoke all on function public.family_ring_answer_readable(uuid) from public,anon;
grant execute on function public.family_ring_answer_readable(uuid) to authenticated;
create policy family_ring_private_answer_read on public.answers
  as restrictive for select to authenticated
  using (public.family_ring_answer_readable(id));
create policy family_ring_private_media_read on public.media_assets
  as restrictive for select to authenticated
  using (answer_id is null or public.family_ring_answer_readable(answer_id));
create policy family_ring_private_video_read on public.video_stories
  as restrictive for select to authenticated
  using (source_answer_id is null or public.family_ring_answer_readable(source_answer_id));

create index if not exists family_ring_media_assets_path_idx
  on public.media_assets(storage_path) where answer_id is not null;
create index if not exists family_ring_audio_archive_path_idx
  on public.answer_audio_archive(storage_path);

create function public.family_ring_storage_readable(input_bucket text,input_path text)
returns boolean language sql volatile security definer
set search_path=public,storage,auth as $$
  select not exists (
    select 1 from public.media_assets m
    where input_bucket in ('photos','audio','videos')
      and m.storage_path=input_path and m.answer_id is not null
      and not public.family_ring_answer_readable(m.answer_id)
  ) and not exists (
    select 1 from public.answer_audio_archive ar
    where input_bucket='audio' and ar.storage_path=input_path
      and not public.family_ring_answer_readable(ar.answer_id)
  ) and not exists (
    select 1 from public.video_stories v
    where input_bucket='videos'
      and input_path in (v.video_storage_path,v.audio_storage_path,v.poster_storage_path)
      and v.source_answer_id is not null
      and not public.family_ring_answer_readable(v.source_answer_id)
  ) and not exists (
    select 1 from public.family_free_story_media fm
    where fm.storage_bucket=input_bucket and fm.storage_path=input_path
      and not public.family_free_story_can_read(fm.story_id));
$$;
revoke all on function public.family_ring_storage_readable(text,text) from public,anon;
grant execute on function public.family_ring_storage_readable(text,text) to authenticated;
create policy family_ring_private_storage_read on storage.objects
  as restrictive for select to authenticated
  using (public.family_ring_storage_readable(bucket_id,name));

-- A SECURITY DEFINER writing path (recording or co-manager tools) must not
-- overwrite a story once its subject has locked it in the year ring.
create function public.family_ring_guard_private_answer_update()
returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  if auth.uid() is not null and old.subject_person_id is not null
    and (old.access_override='private_forever' or exists (
      select 1 from public.family_ring_story_editions e
      where e.answer_id=old.id and e.visibility='private'))
    and not public.family_ring_is_self(old.subject_person_id) then
    raise exception 'This story belongs only to its subject' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger family_ring_guard_private_answer_update
  before update on public.answers for each row
  execute function public.family_ring_guard_private_answer_update();

-- Photos added after confirmation belong to the year ring, not the frozen
-- manuscript. The private bucket uses the same answer/person read boundary.
create table public.family_ring_story_media (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answers(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  storage_path text not null unique,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index family_ring_story_media_answer_idx
  on public.family_ring_story_media(answer_id);
alter table public.family_ring_story_media enable row level security;
grant select,insert,delete on public.family_ring_story_media to authenticated;

create function public.family_ring_can_read_answer(input_answer_id uuid)
returns boolean language sql volatile security definer
set search_path=public,auth as $$
  select public.family_place_access_allowed() and exists (
    select 1 from public.answers a
    join public.book_projects p on p.id=a.book_project_id
    join public.persons subject on subject.id=a.subject_person_id
    join public.families family on family.id=subject.family_id
    left join public.family_ring_story_editions e on e.answer_id=a.id
    where a.id=input_answer_id and a.subject_person_id=p.subject_person_id
      and public.experience_data_allowed(a.book_project_id,false)
      and (public.family_ring_is_self(a.subject_person_id)
        or coalesce(e.visibility,case when a.access_override='private_forever'
          then 'private' else 'family' end)='family')
      and (family.owner_user_id=auth.uid()
        or public.family_ring_is_self(a.subject_person_id)
        or public.person_story_co_manager_allowed(a.subject_person_id)));
$$;
revoke all on function public.family_ring_can_read_answer(uuid) from public,anon;
grant execute on function public.family_ring_can_read_answer(uuid) to authenticated;

create policy family_ring_story_media_read on public.family_ring_story_media
  for select to authenticated
  using (public.family_ring_can_read_answer(answer_id));
create function public.family_ring_media_object_exists(input_answer_id uuid,input_path text)
returns boolean language sql volatile security definer
set search_path=public,storage,auth as $$
  select public.family_ring_is_self(a.subject_person_id)
    and input_path like auth.uid()::text||'/'||input_answer_id::text||'/%'
    and exists(select 1 from storage.objects o
      where o.bucket_id='family-ring-media' and o.name=input_path)
  from public.answers a where a.id=input_answer_id;
$$;
revoke all on function public.family_ring_media_object_exists(uuid,text) from public,anon;
grant execute on function public.family_ring_media_object_exists(uuid,text) to authenticated;
create policy family_ring_story_media_insert on public.family_ring_story_media
  for insert to authenticated
  with check (uploaded_by=auth.uid()
    and public.family_ring_is_self(person_id)
    and exists(select 1 from public.answers a where a.id=answer_id
      and a.subject_person_id=person_id)
    and exists(select 1 from public.book_work_manifests w
      where w.book_project_id=(select a.book_project_id from public.answers a where a.id=answer_id)
        and w.confirmed_at is not null and answer_id=any(w.answer_ids))
    and storage_path like auth.uid()::text||'/'||answer_id::text||'/%'
    and public.family_ring_media_object_exists(answer_id,storage_path));
create policy family_ring_story_media_delete on public.family_ring_story_media
  for delete to authenticated
  using (uploaded_by=auth.uid() and public.family_ring_is_self(person_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('family-ring-media','family-ring-media',false,25000000,
  array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy family_ring_media_upload on storage.objects
  for insert to authenticated
  with check (bucket_id='family-ring-media'
    and split_part(name,'/',1)=auth.uid()::text
    and exists(select 1 from public.answers a
      where a.id=nullif(split_part(name,'/',2),'')::uuid
        and public.family_ring_is_self(a.subject_person_id)
        and exists(select 1 from public.book_work_manifests w
          where w.book_project_id=a.book_project_id and w.confirmed_at is not null
            and a.id=any(w.answer_ids))));
create policy family_ring_media_read on storage.objects
  for select to authenticated
  using (bucket_id='family-ring-media' and exists(
    select 1 from public.family_ring_story_media m
    where m.storage_path=name and public.family_ring_can_read_answer(m.answer_id)));
create policy family_ring_media_delete on storage.objects
  for delete to authenticated
  using (bucket_id='family-ring-media'
    and split_part(name,'/',1)=auth.uid()::text
    and exists(select 1 from public.answers a
      where a.id=nullif(split_part(name,'/',2),'')::uuid
        and public.family_ring_is_self(a.subject_person_id)));

-- A confirmed answer is not edited: the override is the year-ring edition.
-- The manuscript and published snapshot remain untouched.
create function public.family_ring_update_book_story(
  input_answer_id uuid,input_expected_revision bigint,
  input_body text,input_private boolean
) returns jsonb language plpgsql security definer
set search_path=public,auth as $$
declare a public.answers%rowtype; e public.family_ring_story_editions%rowtype;
  frozen boolean; next_visibility text; next_revision bigint;
begin
  if not public.family_place_access_allowed()
    or input_body is null or octet_length(input_body)>400000
    or nullif(btrim(input_body),'') is null or input_private is null then
    raise exception 'Invalid year-ring edit' using errcode='42501';
  end if;
  select * into a from public.answers where id=input_answer_id for update;
  if a.id is null or a.subject_person_id is null
    or not public.family_ring_is_self(a.subject_person_id)
    or not exists(select 1 from public.book_projects p where p.id=a.book_project_id
      and p.subject_person_id=a.subject_person_id
      and p.access_status in ('paid','gifted','legacy'))
    or not (exists(select 1 from public.user_questions q where q.id=a.user_question_id
      and q.book_project_id=a.book_project_id
      and (q.status='answered' or q.answered_at is not null))
      or exists(select 1 from public.book_work_manifests w
        where w.book_project_id=a.book_project_id and w.confirmed_at is not null
          and a.id=any(w.answer_ids))) then
    raise exception 'Story unavailable' using errcode='42501';
  end if;
  next_visibility:=case when input_private then 'private' else 'family' end;
  select * into e from public.family_ring_story_editions where answer_id=a.id for update;
  select exists(select 1 from public.book_work_manifests w
    where w.book_project_id=a.book_project_id and w.confirmed_at is not null
      and a.id=any(w.answer_ids)) into frozen;
  if frozen then
    if input_expected_revision is distinct from coalesce(e.revision,a.text_revision) then
      raise exception 'Story changed' using errcode='40001';
    end if;
    next_revision:=coalesce(e.revision,a.text_revision)+1;
    insert into public.family_ring_story_editions
      (answer_id,book_project_id,person_id,body,visibility,revision)
    values(a.id,a.book_project_id,a.subject_person_id,btrim(input_body),next_visibility,next_revision)
    on conflict(answer_id) do update set body=excluded.body,
      visibility=excluded.visibility,revision=excluded.revision,updated_at=now();
  else
    if input_expected_revision is distinct from a.text_revision then
      raise exception 'Story changed' using errcode='40001';
    end if;
    update public.answers set transcript_edited=btrim(input_body),
      access_override=case when input_private then 'private_forever' else 'inherit' end,
      text_revision=a.text_revision+1 where id=a.id;
    next_revision:=a.text_revision+1;
  end if;
  return jsonb_build_object('body',btrim(input_body),'private',input_private,
    'text_revision',next_revision);
end;
$$;
revoke all on function public.family_ring_update_book_story(uuid,bigint,text,boolean)
  from public,anon;
grant execute on function public.family_ring_update_book_story(uuid,bigint,text,boolean)
  to authenticated;

create function public.family_ring_edited_stories(input_person_id uuid)
returns table(answer_id uuid,book_project_id uuid,question_id uuid,
  question_text text,chapter text,body text,visibility text,revision bigint)
language sql stable security definer set search_path=public,auth as $$
  select e.answer_id,e.book_project_id,q.id,
    coalesce(q.question_text_snapshot,q.custom_question_text,base_q.content,'人生の語り'),
    coalesce(q.chapter,base_q.chapter,'その他の語り'),e.body,e.visibility,e.revision
  from public.family_ring_story_editions e
  join public.answers a on a.id=e.answer_id
  left join public.user_questions q on q.id=a.user_question_id
  left join public.questions base_q on base_q.id=a.question_id
  join public.book_projects p on p.id=e.book_project_id
  join public.persons subject on subject.id=e.person_id
  join public.families family on family.id=subject.family_id
  where e.person_id=input_person_id and a.subject_person_id=input_person_id
    and ((q.book_project_id=e.book_project_id
      and (q.status='answered' or q.answered_at is not null))
      or exists(select 1 from public.book_work_manifests w
        where w.book_project_id=e.book_project_id and w.confirmed_at is not null
          and a.id=any(w.answer_ids)))
    and public.family_place_access_allowed()
    and public.experience_data_allowed(e.book_project_id,false)
    and (family.owner_user_id=auth.uid()
      or public.family_ring_is_self(e.person_id)
      or public.person_story_co_manager_allowed(e.person_id))
    and (e.visibility='family' or public.family_ring_is_self(e.person_id));
$$;
revoke all on function public.family_ring_edited_stories(uuid) from public,anon;
grant execute on function public.family_ring_edited_stories(uuid) to authenticated;

-- SECURITY DEFINER bypasses table RLS. The co-manager BOOK endpoints must
-- apply the same person-level lock explicitly, including the later edition.
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
    and public.person_story_linked_answer_readable(a.id)
    and public.family_ring_answer_readable(a.id);
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
      and (ma.answer_id is null or (public.person_story_linked_answer_readable(ma.answer_id)
        and public.family_ring_answer_readable(ma.answer_id)))
    union all
    select jsonb_build_object(
      'media_id',vs.id,'answer_id',vs.source_answer_id,
      'storage_path',vs.video_storage_path,'asset_type','video',
      'meta_json',vs.metadata,'created_at',vs.created_at)
    from public.video_stories vs
    where vs.book_project_id=input_book_project_id
      and vs.video_storage_path is not null
      and (vs.source_answer_id is null or
        (public.person_story_linked_answer_readable(vs.source_answer_id)
          and public.family_ring_answer_readable(vs.source_answer_id)))
  ) items;
  return result;
end;
$$;

-- A lock must also stop legacy co-manager writes that bypass answer RLS.
create or replace function public.update_co_manager_story(
  input_answer_id uuid,input_book_text text,input_private boolean
) returns boolean language plpgsql security definer
set search_path=public,auth as $$
declare target_project_id uuid;
begin
  select book_project_id into target_project_id from public.answers
    where id=input_answer_id for update;
  if target_project_id is null or not (public.is_project_co_manager(target_project_id) or exists (
    select 1 from public.book_projects bp where bp.id=target_project_id
      and bp.owner_user_id=auth.uid()))
    or not public.experience_data_allowed(target_project_id,true)
    or not public.family_ring_answer_readable(input_answer_id) then
    raise exception 'この語りを編集できません' using errcode='42501'; end if;
  if length(coalesce(input_book_text,'')) > 50000 then
    raise exception '文章が長すぎます' using errcode='22023'; end if;
  update public.answers set transcript_edited=input_book_text,
    access_override=case when input_private then 'private_forever' else 'inherit' end
    where id=input_answer_id;
  return true;
end;
$$;

-- Sharing endpoints bypass answer RLS; enforce the year-ring lock there too.

create or replace function public.family_answer_visible(a uuid,u uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select u=auth.uid() and public.family_ring_answer_readable(a)
    and exists(select 1 from public.answers x where x.id=a and
      (public.family_creator(x.book_project_id,u)
        or (x.access_override<>'private_forever'
          and public.shared_story_recipient_can_view(x.book_project_id))));
$$;

create or replace function public.family_voice_edit_context(p uuid,target uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a public.answers%rowtype;
begin
  if not public.family_creator(p) or not public.experience_data_allowed(p,true) then
    raise exception 'Subject access required' using errcode='42501'; end if;
  select * into a from public.answers where id=target and book_project_id=p;
  if a.id is null or not public.family_question_allowed(a.user_question_id)
    or not public.family_ring_answer_readable(a.id) then
    raise exception 'Story unavailable' using errcode='42501'; end if;
  return jsonb_build_object('answerId',a.id,'questionId',a.user_question_id,
    'revision',family_private.story_revision(a.id),
    'baseText',coalesce(nullif(a.transcript_edited,''),nullif(a.transcript_readable,''),a.transcript_raw,''),
    'audioPaths',(select coalesce(jsonb_agg(storage_path order by created_at,id),'[]')
      from public.media_assets where answer_id=a.id and asset_type='audio'));
end;
$$;

create or replace function public.book_milestone_context(p uuid,q uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare u public.user_questions%rowtype; a public.answers%rowtype; rev text;
begin
  if not public.book_milestone_allowed(p) then
    raise exception 'Forbidden' using errcode='42501'; end if;
  select * into u from public.user_questions where id=q and book_project_id=p and is_active;
  if u.id is null or not coalesce(u.meta_json->'answer_formats','[]') @> '["video"]'::jsonb then
    raise exception 'Question format unavailable'; end if;
  if exists(select 1 from public.experience_contracts where book_project_id=p)
    and not public.family_question_allowed(q) then
    raise exception 'Question unavailable'; end if;
  select * into a from public.answers where book_project_id=p and user_question_id=q;
  if a.id is not null and not public.family_ring_answer_readable(a.id) then
    raise exception 'Story unavailable' using errcode='42501'; end if;
  rev:=md5(jsonb_build_object('answer',to_jsonb(a),
    'media',(select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]')
      from public.media_assets m where m.answer_id=a.id),
    'videos',(select coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]')
      from public.video_stories v where v.source_answer_id=a.id))::text);
  return jsonb_build_object('revision',rev,'answerId',a.id,'text',u.question_text_snapshot,
    'hint',case when u.question_id='TY_ONB04' then
      E'話すヒント（すべてに答える必要はありません）\n・始めようと思ったきっかけ\n・誰かから贈られた方は、そのときのこと\n・これから語ってみたいこと\n・始める今、感じていること'
      else u.meta_json->>'prompt_hint' end,
    'textBody',coalesce(a.transcript_edited,a.transcript_readable,a.transcript_raw,''),
    'hasVideo',exists(select 1 from public.video_stories where source_answer_id=a.id),
    'audioPartCount',(select count(*) from public.media_assets
      where answer_id=a.id and asset_type='audio' and meta_json->>'video_id' is null),
    'videoCount',(select count(*) from public.video_stories where book_project_id=p));
end;
$$;

create or replace function public.get_supporter_book_stories(
  input_book_project_id uuid
)
returns table (
  answer_id uuid,
  sequence_order integer,
  book_text text,
  created_at timestamptz,
  question_id text,
  question_text text,
  chapter_title text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from public.project_supporters ps
    where ps.book_project_id = input_book_project_id
      and ps.supporter_user_id = auth.uid()
      and ps.status = 'active'
      and (
        ps.can_edit_book_text = true
        or ps.can_build_book = true
      )
  ) then
    raise exception 'Supporter access is not allowed';
  end if;

  if not public.supporter_can_view_shared_story(input_book_project_id) then
    return;
  end if;

  return query
  select
    a.id,
    a.sequence_order,
    coalesce(
      nullif(a.transcript_edited, ''),
      case
        when a.selected_style = 'essay' then nullif(a.transcript_essay, '')
        else nullif(a.transcript_readable, '')
      end,
      nullif(a.transcript_readable, ''),
      nullif(a.transcript_clean, ''),
      ''
    ),
    a.created_at,
    uq.question_id::text,
    coalesce(uq.custom_question_text, uq.question_text_snapshot, ''),
    coalesce(uq.chapter_title_snapshot, uq.chapter, 'その他')
  from public.answers a
  left join public.user_questions uq
    on uq.id = a.user_question_id
  where a.book_project_id = input_book_project_id
    and coalesce(a.access_override, 'inherit') <> 'private_forever'
    and public.family_ring_answer_readable(a.id)
  order by a.sequence_order asc;
end;
$$;

create or replace function public.get_supporter_book_photos(
  input_book_project_id uuid
)
returns table (
  media_id uuid,
  answer_id uuid,
  storage_path text,
  meta_json jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from public.project_supporters ps
    where ps.book_project_id = input_book_project_id
      and ps.supporter_user_id = auth.uid()
      and ps.status = 'active'
      and (
        ps.can_manage_photos = true
        or ps.can_edit_book_text = true
        or ps.can_build_book = true
      )
  ) then
    raise exception 'Supporter access is not allowed';
  end if;

  if not public.supporter_can_view_shared_story(input_book_project_id) then
    return;
  end if;

  return query
  select
    ma.id,
    ma.answer_id,
    ma.storage_path,
    ma.meta_json,
    ma.created_at
  from public.media_assets ma
  join public.answers a
    on a.id = ma.answer_id
  where a.book_project_id = input_book_project_id
    and coalesce(a.access_override, 'inherit') <> 'private_forever'
    and public.family_ring_answer_readable(a.id)
    and ma.asset_type = 'photo'
  order by ma.created_at asc;
end;
$$;

create or replace function public.get_received_story_stories(input_book_project_id uuid)
returns table (
  answer_id uuid,
  sequence_order integer,
  book_text text,
  created_at timestamptz,
  question_text text,
  chapter_title text
)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.shared_story_recipient_can_view(input_book_project_id) then
    raise exception 'Shared story access is not allowed';
  end if;

  return query
  select
    a.id,
    a.sequence_order,
    coalesce(
      nullif(a.transcript_edited, ''),
      case when a.selected_style = 'essay' then nullif(a.transcript_essay, '') else nullif(a.transcript_readable, '') end,
      nullif(a.transcript_readable, ''),
      nullif(a.transcript_clean, ''),
      ''
    ),
    a.created_at,
    coalesce(uq.custom_question_text, uq.question_text_snapshot, '残された語り'),
    coalesce(uq.chapter_title_snapshot, uq.chapter, '物語')
  from public.answers a
  left join public.user_questions uq on uq.id = a.user_question_id
  where a.book_project_id = input_book_project_id
    and coalesce(a.access_override, 'inherit') <> 'private_forever'
    and public.family_ring_answer_readable(a.id)
  order by a.sequence_order asc;
end;
$$;
commit;
