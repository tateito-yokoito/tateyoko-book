begin;
-- Live previews are operator-only and cease to exist when the fixed publication exists.
-- No writes, publication generation, or customer impersonation occur here.
create or replace function public.get_web_book_preview(input_project_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare selection uuid[]; live_snapshot jsonb;
begin
 if auth.uid() is null or public.is_tateyoko_admin() is distinct from true then raise exception 'Forbidden'; end if;
 if not exists(select 1 from book_projects where id=input_project_id) then raise exception 'Not found'; end if;
 if exists(select 1 from voice_publications where book_project_id=input_project_id and status in('published','disabled')) then
   raise exception 'Completed work: open the customer bookshelf';
 end if;
 select answer_ids into selection from book_work_manifests where book_project_id=input_project_id;
 if selection is null then
   select coalesce(array_agg(a.id order by a.sequence_order,a.created_at),'{}') into selection
   from answers a join book_projects p on p.id=a.book_project_id left join user_questions q on q.id=a.user_question_id
   where p.id=input_project_id and a.subject_person_id=p.subject_person_id
     and a.access_override is distinct from 'private_forever'
     and coalesce(q.meta_json->>'onboarding_group','')<>'trial_experience'
     and coalesce(q.meta_json->>'include_in_book_body','true')<>'false';
 end if;
 -- Saved selection, current content. Never substitute an earlier confirmed snapshot.
 select coalesce(array_agg(a.id order by array_position(selection,a.id)),'{}') into selection
 from answers a join book_projects p on p.id=a.book_project_id
 where p.id=input_project_id and a.id=any(selection) and a.subject_person_id=p.subject_person_id
   and a.access_override is distinct from 'private_forever';
 select jsonb_build_object(
   'project',to_jsonb(p),'subject',(select to_jsonb(s) from persons s where s.id=p.subject_person_id),
   'cover',(select to_jsonb(c) from book_cover_settings c where c.book_project_id=p.id),
   'answers',(select coalesce(jsonb_agg(to_jsonb(a) order by array_position(selection,a.id)),'[]') from answers a where a.id=any(selection)),
   'questions',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') from user_questions q where q.book_project_id=p.id and q.id in(select user_question_id from answers where id=any(selection))),
   'media',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]') from media_assets m where m.book_project_id=p.id and m.answer_id=any(selection)),
   'videos',(select coalesce(jsonb_agg(to_jsonb(v) order by v.slot_order),'[]') from video_stories v where v.book_project_id=p.id and v.source_answer_id=any(selection) and v.status in('ready','failed')),
   'web_intro',public.web_book_intro(p.id)
 ) into live_snapshot from book_projects p where p.id=input_project_id;
 return jsonb_build_object('adminPreview',true,'snapshot',live_snapshot);
end; $$;
revoke all on function public.get_web_book_preview(uuid) from public,anon;
grant execute on function public.get_web_book_preview(uuid) to authenticated;
commit;
