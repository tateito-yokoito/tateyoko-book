begin;
create table public.book_work_manifests (
 book_project_id uuid primary key references public.book_projects(id),
 id uuid not null unique default gen_random_uuid(),
 answer_ids uuid[] not null default '{}', revision integer not null default 0,
 confirmed_at timestamptz, confirmed_by uuid references auth.users(id), snapshot jsonb,
 constraint book_work_snapshot_state check((confirmed_at is null)=(snapshot is null))
);
alter table public.book_work_manifests enable row level security;
revoke all on public.book_work_manifests from anon,authenticated;
grant select,insert,update on public.book_work_manifests to service_role;
alter table public.voice_publications add column work_manifest_id uuid references public.book_work_manifests(id);
create unique index voice_publications_work_unique on public.voice_publications(work_manifest_id) where work_manifest_id is not null;

create function public.get_book_work(input_project_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare w public.book_work_manifests%rowtype; ids uuid[];
begin
 if public.can_manage_book_cover(input_project_id) is distinct from true then raise exception 'Forbidden'; end if;
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
 return to_jsonb(w)||jsonb_build_object('publication',(
   select to_jsonb(p)||jsonb_build_object('items',(select jsonb_agg(to_jsonb(i) order by i.item_order) from voice_publication_items i where i.publication_id=p.id))
   from voice_publications p where p.work_manifest_id=w.id));
end; $$;

create function public.save_book_selection(input_project_id uuid,input_answer_ids uuid[],input_expected_revision integer) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare w public.book_work_manifests%rowtype; person uuid;
begin
 if public.can_manage_book_cover(input_project_id) is distinct from true then raise exception 'Forbidden'; end if;
 perform public.assert_experience_processing(input_project_id,auth.uid());
 select subject_person_id into person from book_projects where id=input_project_id for update;
 insert into book_work_manifests(book_project_id) values(input_project_id) on conflict do nothing;
 select * into w from book_work_manifests where book_project_id=input_project_id for update;
 if w.confirmed_at is not null then raise exception 'This work is already confirmed'; end if;
 if w.revision is distinct from input_expected_revision then raise exception 'Selection changed; reload before saving'; end if;
 if input_answer_ids is null or cardinality(input_answer_ids)<>(select count(distinct x) from unnest(input_answer_ids) x)
  or exists(select 1 from unnest(input_answer_ids) x where not exists(select 1 from answers a
   where a.id=x and a.book_project_id=input_project_id and a.subject_person_id=person and a.access_override is distinct from 'private_forever')) then
  raise exception 'Invalid work selection';
 end if;
 update book_work_manifests set answer_ids=input_answer_ids,revision=revision+1 where book_project_id=input_project_id returning * into w;
 return to_jsonb(w);
end; $$;

create function public.confirm_book_work(input_project_id uuid,input_expected_revision integer,input_subject_confirmed boolean) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare w public.book_work_manifests%rowtype; payload jsonb;
begin
 if public.can_manage_book_cover(input_project_id) is distinct from true or input_subject_confirmed is distinct from true then raise exception 'Subject confirmation required'; end if;
 perform public.assert_experience_processing(input_project_id,auth.uid());
 perform 1 from book_projects where id=input_project_id for update;
 select * into w from book_work_manifests where book_project_id=input_project_id for update;
 if w.id is null then raise exception 'Save selection first'; end if;
 if w.confirmed_at is not null then return to_jsonb(w); end if;
 if w.revision is distinct from input_expected_revision or cardinality(w.answer_ids)=0 then raise exception 'Review the selected stories'; end if;
 if exists(select 1 from unnest(w.answer_ids) x where not exists(select 1 from answers a join book_projects p on p.id=a.book_project_id
   where a.id=x and a.book_project_id=input_project_id and a.subject_person_id=p.subject_person_id and a.access_override is distinct from 'private_forever')) then raise exception 'Selection no longer available'; end if;
 if exists(select 1 from video_stories where book_project_id=input_project_id and (status='processing' or metadata->>'upload_complete'='false')) then raise exception 'Finish video uploads first'; end if;
 select jsonb_build_object(
  'project',to_jsonb(p),'cover',(select to_jsonb(c) from book_cover_settings c where c.book_project_id=p.id),
  'subject',(select to_jsonb(s) from persons s where s.id=p.subject_person_id),
  'answers',(select coalesce(jsonb_agg(to_jsonb(a) order by array_position(w.answer_ids,a.id)),'[]') from answers a where a.id=any(w.answer_ids)),
  'questions',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from user_questions q where q.id in(select user_question_id from answers where id=any(w.answer_ids))),
  'media',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at),'[]') from media_assets m where m.answer_id=any(w.answer_ids) and m.book_project_id=p.id),
  'videos',(select coalesce(jsonb_agg(to_jsonb(v) order by v.slot_order),'[]') from video_stories v where v.book_project_id=p.id and v.status in('ready','failed'))
 ) into payload from book_projects p where p.id=input_project_id;
 update book_work_manifests set snapshot=payload,confirmed_at=now(),confirmed_by=auth.uid() where id=w.id returning * into w;
 return to_jsonb(w);
end; $$;

create function public.guard_confirmed_book_work() returns trigger language plpgsql set search_path=public as $$
begin
 if old.confirmed_at is not null and new is distinct from old then raise exception 'Confirmed work is immutable'; end if;
 return new;
end; $$;
create trigger immutable_book_work before update on book_work_manifests for each row execute function guard_confirmed_book_work();
revoke all on function public.get_book_work(uuid),public.save_book_selection(uuid,uuid[],integer),public.confirm_book_work(uuid,integer,boolean),public.guard_confirmed_book_work() from public,anon;
grant execute on function public.get_book_work(uuid),public.save_book_selection(uuid,uuid[],integer),public.confirm_book_work(uuid,integer,boolean) to authenticated;
commit;
