begin;
-- The normal book editor is used by the subject, never by the supporter.
drop policy family_guard on public.book_cover_settings;
create policy family_guard on public.book_cover_settings as restrictive for all to authenticated
using(not family_managed(book_project_id) or family_subject(book_project_id))
with check(not family_managed(book_project_id) or family_subject(book_project_id));
-- Preserve the established order calculation/discount logic, but fund a
-- Person-bound work by relationship, not its historical creator column.
do $$declare definition text; needle text:='id = input_book_project_id and owner_user_id = input_purchaser_user_id';
begin
 select pg_get_functiondef('public.create_book_commerce_order(uuid,uuid,text,integer,integer,boolean,jsonb)'::regprocedure) into definition;
 if position(needle in definition)=0 then raise exception 'Commerce signature changed: review required'; end if;
 execute replace(definition,needle,'id = input_book_project_id and (case when family_managed(id) then family_supporter(id,input_purchaser_user_id) or family_subject(id,input_purchaser_user_id) else owner_user_id = input_purchaser_user_id end)');
end $$;
-- Historical TEST trials use positions 1..3. New opening questions may be
-- appended elsewhere without renumbering any existing question or answer.
do $$declare definition text; needle text:='(q.sequence_order is null or q.sequence_order>4)';
begin
 select pg_get_functiondef('public.guard_experience_content_write()'::regprocedure) into definition;
 if position(needle in definition)=0 then raise exception 'Content guard changed: review required'; end if;
 execute replace(definition,needle,'(case when family_managed(pid) then coalesce(q.meta_json->>''onboarding_group'','''') not in (''starting_conversation'',''life_outline'',''starting_motivation'') else q.sequence_order is null or q.sequence_order>4 end)');
end $$;
-- Question groups, not numeric order, define the paid-intent boundary.
create or replace function public.family_question_allowed(q uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from user_questions uq where uq.id=q and uq.is_active and experience_data_allowed(uq.book_project_id,true)
 and (uq.meta_json->>'onboarding_group'='trial_experience'
 or exists(select 1 from experience_contracts c where c.book_project_id=uq.book_project_id
  and c.payment_confirmed_at is not null and c.refund_confirmed_at is null
  and c.production_started_at is not null and c.production_expires_at>now()
  and (uq.meta_json->>'onboarding_group' in ('starting_conversation','life_outline','starting_motivation') or c.main_experience_started_at is not null))
 or (not exists(select 1 from experience_contracts c where c.book_project_id=uq.book_project_id)
  and exists(select 1 from commerce_orders o where o.book_project_id=uq.book_project_id and o.status='paid' and o.includes_base_book))))
$$;

-- Payer-readable receipts must never contain the subject's private cover.
create function public.family_order_privacy_guard() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if family_managed(new.book_project_id) and not family_subject(new.book_project_id,new.purchaser_user_id) then
   if tg_op='INSERT' and not family_supporter(new.book_project_id,new.purchaser_user_id) then
     raise exception 'Family payer access required' using errcode='42501';
   end if;
   new.design_snapshot:='{}'::jsonb;
 end if;
 return new;
end $$;
revoke all on function public.family_order_privacy_guard() from public,anon,authenticated;
create trigger family_order_privacy before insert or update on public.commerce_orders
for each row execute function public.family_order_privacy_guard();

-- The fourth opening question is optional in the existing experience.
create or replace function public.family_finish_starting_chapter(p uuid) returns void
language plpgsql security definer set search_path=public,auth as $$
begin
 if not family_subject(p) then raise exception 'Subject access required' using errcode='42501'; end if;
 if not exists(select 1 from experience_contracts where book_project_id=p and payment_confirmed_at is not null
 and refund_confirmed_at is null and production_started_at is not null and production_expires_at>now())
 or not experience_data_allowed(p,true) then raise exception 'Active production required'; end if;
 if (select count(*) from user_questions q where q.book_project_id=p and q.is_active
 and q.meta_json->>'onboarding_group' in ('starting_conversation','life_outline')
 and exists(select 1 from answers a where a.book_project_id=p and a.user_question_id=q.id))<3
 then raise exception 'Finish the starting chapter first'; end if;
 update book_projects set onboarding_ritual_step='chapter_complete',starting_motivation_completed_at=coalesce(starting_motivation_completed_at,now())
 where id=p and coalesce(onboarding_ritual_step,'') not in ('chapter_complete','theme_intro','completed');
end $$;
commit;
