begin;
create or replace function public.get_book_work(input_project_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare w public.book_work_manifests%rowtype; ids uuid[];
begin
 if public.can_manage_book_cover(input_project_id) is distinct from true or public.experience_data_allowed(input_project_id,false) is distinct from true then raise exception 'Forbidden'; end if;
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
commit;
