begin;
-- Derived from the existing nine-theme question set. No answer content or
-- purchaser/subject relationship is changed by navigation.
create function family_private.theme_navigation(p uuid) returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare b book_projects%rowtype; codes text[]:=array['ty_theme_childhood','ty_theme_youth','ty_theme_likes','ty_theme_living','ty_theme_work','ty_theme_connections','ty_theme_family','ty_theme_turning_points','ty_theme_now_future'];
 i integer; total integer; remaining integer; state jsonb;
begin
 select * into b from book_projects where id=p;
 if not family_managed(p) or not exists(select 1 from experience_contracts where book_project_id=p
 and main_experience_started_at is not null and refund_confirmed_at is null) then return null;end if;
 if not family_subject(p) and not (family_supporter(p) and exists(select 1 from family_subject_bindings where person_id=b.subject_person_id and progress_enabled)) then return null;end if;
 state:=coalesce(b.theme_experience_state,'{}');
 if coalesce(b.onboarding_ritual_step,'')<>'completed' then
   return jsonb_build_object('phase','first_intro','order',1,'code',codes[1]);
 end if;
 for i in 1..9 loop
   select count(*),count(*) filter(where coalesce(status,'pending') not in ('answered','skipped')) into total,remaining
   from user_questions where book_project_id=p and is_active and meta_json->>'theme_code'=codes[i]
   and coalesce(meta_json->>'onboarding_group','') not in ('trial_experience','starting_conversation','life_outline','starting_motivation');
   if total=0 or remaining>0 then return null;end if;
   if not coalesce(state->'family_acknowledged_themes','[]'::jsonb) @> jsonb_build_array(i) then
     return jsonb_build_object('phase',case when (state->>'pending_transition_order')::integer=i and state->>'pending_transition_phase'='intro' then 'intro' else 'complete' end,'order',i,'code',codes[i]);
   end if;
 end loop;
 return null;
end $$;
revoke all on function family_private.theme_navigation(uuid) from public,anon,authenticated;

create function public.family_theme_navigate(p uuid, expected jsonb, action text) returns void
language plpgsql security definer set search_path=public,auth as $$
declare b book_projects%rowtype; current_state jsonb; next_state jsonb; receipt jsonb; n integer;
begin
 if not family_managed(p) or not (family_subject(p) or family_supporter(p)) or not experience_data_allowed(p,true) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into b from book_projects where id=p for update;
 current_state:=family_private.theme_navigation(p);
 receipt:=jsonb_build_object('expected',expected,'action',action,'actor',auth.uid());
 if coalesce(b.theme_experience_state,'{}')->'family_navigation_receipt'=receipt then return;end if;
 if current_state is null or expected is distinct from current_state then raise exception 'Navigation changed' using errcode='40001';end if;
 n:=(current_state->>'order')::integer;
 next_state:=coalesce(b.theme_experience_state,'{}');
 if current_state->>'phase'='first_intro' and action='enter' then
   update book_projects set onboarding_ritual_step='completed',onboarding_status='completed' where id=p;
 elsif current_state->>'phase'='complete' and action='next' and n<9 then
   next_state:=next_state||jsonb_build_object('pending_transition_order',n,'pending_transition_phase','intro');
 elsif (current_state->>'phase'='intro' and action='enter') or (current_state->>'phase'='complete' and n=9 and action='finish') then
   next_state:=next_state||jsonb_build_object('family_acknowledged_themes',coalesce(next_state->'family_acknowledged_themes','[]'::jsonb)||jsonb_build_array(n),'pending_transition_order',null,'pending_transition_phase',null);
 else raise exception 'Invalid navigation';end if;
 update book_projects set theme_experience_state=next_state||jsonb_build_object('family_navigation_receipt',receipt) where id=p;
end $$;
revoke all on function public.family_theme_navigate(uuid,jsonb,text) from public,anon;
grant execute on function public.family_theme_navigate(uuid,jsonb,text) to authenticated;

create function public.family_skip_question(p uuid, q uuid) returns void
language plpgsql security definer set search_path=public,auth as $$
begin
 if not family_managed(p) or not (family_subject(p) or family_supporter(p)) or not experience_data_allowed(p,true)
 or not exists(select 1 from user_questions where id=q and book_project_id=p and family_question_allowed(q)) then raise exception 'Forbidden' using errcode='42501';end if;
 -- A skip never removes or hides a saved answer.
 update user_questions set status='skipped' where id=q and book_project_id=p and status is distinct from 'answered';
end $$;
revoke all on function public.family_skip_question(uuid,uuid) from public,anon;
grant execute on function public.family_skip_question(uuid,uuid) to authenticated;

do $$declare definition text;begin
 select pg_get_functiondef('public.family_journey(uuid)'::regprocedure) into definition;
 if position('return w||jsonb_build_object' in definition)=0 or position('''chapter'',q.chapter_title_snapshot' in definition)=0 then raise exception 'Journey changed: review required';end if;
 definition:=replace(definition,'return w||jsonb_build_object','w:=w||jsonb_build_object(''theme_navigation'',family_private.theme_navigation(p)); return w||jsonb_build_object');
 definition:=replace(definition,'''chapter'',q.chapter_title_snapshot','''chapter'',q.chapter_title_snapshot,''skipped'',case when w->>''role''=''subject'' or (w->>''progress_enabled'')::boolean then q.status=''skipped'' else null end');
 execute definition;
end $$;
commit;
