begin;
-- Additional Web-only opening material is frozen at the same confirmation as paper.
-- Existing confirmed works are not backfilled from mutable live answers.
create function public.web_book_intro(p uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 with selected as (select a.* from answers a join user_questions q on q.id=a.user_question_id
 join book_projects b on b.id=a.book_project_id
 where b.id=p and a.subject_person_id=b.subject_person_id and q.book_project_id=p
 and q.question_id in ('TY_ONB01','TY_ONB02','TY_ONB03') and a.access_override is distinct from 'private_forever')
 select jsonb_build_object('answers',(select coalesce(jsonb_agg(to_jsonb(a) order by a.sequence_order),'[]') from selected a),
 'questions',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') from user_questions q where q.id in(select user_question_id from selected)),
 'media',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]') from media_assets m where m.book_project_id=p and m.answer_id in(select id from selected)))
$$;
revoke all on function public.web_book_intro(uuid) from public,anon,authenticated;
create function public.capture_web_book_intro() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.confirmed_at is not null and (tg_op='INSERT' or old.confirmed_at is null) then
   new.snapshot:=new.snapshot||jsonb_build_object('web_intro',public.web_book_intro(new.book_project_id));
 end if;
 return new;
end; $$;
revoke all on function public.capture_web_book_intro() from public,anon,authenticated;
create trigger capture_web_book_intro before insert or update on public.book_work_manifests
for each row execute function public.capture_web_book_intro();
-- Read-only projection. Never creates a publication, confirms a work, or changes sharing.
create or replace function public.get_web_book_preview(input_project_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare w jsonb; live_snapshot jsonb; is_admin boolean;
begin
 if auth.uid() is null then raise exception 'Forbidden'; end if;
 is_admin:=public.is_tateyoko_admin();
 if is_admin is distinct from true then
   if public.can_manage_book_cover(input_project_id) is distinct from true then raise exception 'Forbidden'; end if;
   perform public.assert_experience_processing(input_project_id,auth.uid());
 end if;
 if not exists(select 1 from book_projects where id=input_project_id) then raise exception 'Not found'; end if;
 -- get_book_work is a read-only function; default selection preserves current exclusions.
 if is_admin then
   select to_jsonb(m) into w from book_work_manifests m where m.book_project_id=input_project_id;
   if w is null then
     select jsonb_build_object('answer_ids',coalesce(jsonb_agg(a.id order by a.sequence_order),'[]')) into w
     from answers a join book_projects p on p.id=a.book_project_id left join user_questions q on q.id=a.user_question_id
     where p.id=input_project_id and a.subject_person_id=p.subject_person_id and a.access_override is distinct from 'private_forever'
     and coalesce(q.meta_json->>'onboarding_group','')<>'trial_experience' and coalesce(q.meta_json->>'include_in_book_body','true')<>'false';
   end if;
 else w:=public.get_book_work(input_project_id); end if;
 select jsonb_build_object(
  'project',to_jsonb(p),'cover',(select to_jsonb(c) from book_cover_settings c where c.book_project_id=p.id),
  'subject',(select to_jsonb(s) from persons s where s.id=p.subject_person_id),
  'answers',(select coalesce(jsonb_agg(to_jsonb(a) order by ids.ordinality),'[]') from jsonb_array_elements_text(w->'answer_ids') with ordinality ids(id,ordinality) join answers a on a.id=ids.id::uuid where a.book_project_id=p.id and a.subject_person_id=p.subject_person_id),
  'questions',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') from user_questions q where q.book_project_id=p.id and q.id in(select a.user_question_id from answers a where a.book_project_id=p.id and (w->'answer_ids') ? a.id::text)),
  'media',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]') from media_assets m where m.book_project_id=p.id and (w->'answer_ids') ? m.answer_id::text),
  'videos',(select coalesce(jsonb_agg(to_jsonb(v) order by v.slot_order),'[]') from video_stories v where v.book_project_id=p.id and v.status in('ready','failed'))
 ) into live_snapshot from book_projects p where p.id=input_project_id;
 live_snapshot:=live_snapshot||jsonb_build_object('web_intro',public.web_book_intro(input_project_id));
 return jsonb_build_object('adminPreview',is_admin,'workId',w->>'id','snapshot',case when w->>'confirmed_at' is not null then w->'snapshot' else live_snapshot end,
   'hasUnpublishedChanges',case when w->>'confirmed_at' is null then false else
     exists(select 1 from jsonb_array_elements(live_snapshot->'answers') a where not exists(select 1 from jsonb_array_elements(w->'snapshot'->'answers') old where old=a))
     or (live_snapshot->'cover') is distinct from (w->'snapshot'->'cover')
     or exists(select 1 from jsonb_array_elements(live_snapshot->'media') m where not exists(select 1 from jsonb_array_elements(w->'snapshot'->'media') old where old=m))
     or exists(select 1 from jsonb_array_elements(w->'snapshot'->'media') m where not exists(select 1 from jsonb_array_elements(live_snapshot->'media') current where current=m))
     or exists(select 1 from jsonb_array_elements(w->'snapshot'->'answers') a where not exists(select 1 from jsonb_array_elements(live_snapshot->'answers') current where current=a))
     or (live_snapshot->'videos') is distinct from (w->'snapshot'->'videos')
     or (w->'snapshot' ? 'web_intro' and (live_snapshot->'web_intro') is distinct from (w->'snapshot'->'web_intro')) end);
end; $$;
revoke all on function public.get_web_book_preview(uuid) from public,anon;
grant execute on function public.get_web_book_preview(uuid) to authenticated;
commit;
