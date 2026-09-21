begin;

-- Payer/supporter may fund a work, never end the subject's refund guarantee.
create or replace function public.can_confirm_experience_intent(input_project_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
 select auth.uid() is not null and exists(select 1 from book_projects p
 where p.id=input_project_id and p.status='active' and
 case when family_managed(p.id) then family_subject(p.id)
 else p.owner_user_id=auth.uid() or exists(select 1 from project_supporters s
 where s.book_project_id=p.id and s.supporter_user_id=auth.uid()
 and s.status='active' and s.can_operate_recording) end)
$$;

-- A funded existing family work keeps its order/project identity. The contract
-- follows gift terms (45 days; production starts with the subject), not the
-- legacy order_type=self fulfilment route used for an already existing Project.
create or replace function public.register_experience_contract(input_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare o commerce_orders%rowtype; p book_projects%rowtype; c experience_contracts%rowtype;
 base_amount integer; purchase_kind text;
begin
 select * into o from commerce_orders where id=input_order_id for update;
 select * into c from experience_contracts where order_id=input_order_id;
 if c.order_id is not null then return to_jsonb(c); end if;
 if o.id is null or o.status<>'checkout_pending' or o.order_type not in ('self','gift') or not o.includes_base_book then
  raise exception 'Only a new unpaid base-book order can adopt v2 terms'; end if;
 if coalesce(o.standard_extra_copy_count,0)>0 or coalesce(o.premium_copy_count,0)>0 then
  raise exception 'V2 base purchase must not include reprint options'; end if;
 if o.book_project_id is not null then
  select * into p from book_projects where id=o.book_project_id;
  if p.subject_person_id is null then raise exception 'A subject Person is required'; end if;
 elsif o.order_type='self' then raise exception 'A self purchase requires a project'; end if;
 purchase_kind:=o.order_type;
 if p.id is not null and family_managed(p.id) and not family_subject(p.id,o.purchaser_user_id) then
  if not family_supporter(p.id,o.purchaser_user_id) then raise exception 'Family payer access required'; end if;
  purchase_kind:='gift';
 end if;
 base_amount:=greatest(0,coalesce(nullif(o.base_book_amount,0),o.amount_subtotal,0)-o.discount_amount);
 insert into experience_contracts(order_id,book_project_id,subject_person_id,purchaser_user_id,purchase_kind,guarantee_days,base_paid_amount)
 values(o.id,p.id,p.subject_person_id,o.purchaser_user_id,purchase_kind,case when purchase_kind='gift' then 45 else 30 end,base_amount)
 returning * into c;
 return to_jsonb(c);
end $$;

create or replace function public.family_question_allowed(q uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from user_questions uq where uq.id=q and uq.is_active and experience_data_allowed(uq.book_project_id,true)
 and (uq.meta_json->>'onboarding_group'='trial_experience'
 or exists(select 1 from experience_contracts c where c.book_project_id=uq.book_project_id
  and c.payment_confirmed_at is not null and c.refund_confirmed_at is null
  and c.production_started_at is not null and c.production_expires_at>now()
  and (uq.sequence_order<=4 or c.main_experience_started_at is not null))
 or (not exists(select 1 from experience_contracts c where c.book_project_id=uq.book_project_id)
  and exists(select 1 from commerce_orders o where o.book_project_id=uq.book_project_id and o.status='paid' and o.includes_base_book))))
$$;

create function public.family_journey(p uuid) returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare w jsonb; c experience_contracts%rowtype; stage text;
begin
 w:=family_workspace(p); -- Existing subject/supporter authorization + privacy filtering.
 select * into c from experience_contracts where book_project_id=p
 order by (refund_confirmed_at is null) desc,created_at desc limit 1;
 select onboarding_ritual_step into stage from book_projects where id=p;
 return w||jsonb_build_object('ritual_step',stage,'access',jsonb_build_object(
 'paid',c.payment_confirmed_at is not null,'production_started_at',c.production_started_at,
 'main_started_at',c.main_experience_started_at,'guarantee_days',c.guarantee_days,
 'guarantee_expires_at',c.guarantee_expires_at,'production_expires_at',c.production_expires_at,
 'can_create',experience_data_allowed(p,true), 'refunded',c.refund_confirmed_at is not null),
 'questions',(select coalesce(jsonb_agg(x.value||jsonb_build_object(
  'group',q.meta_json->>'onboarding_group','theme_code',q.meta_json->>'theme_code',
  'chapter',q.chapter_title_snapshot) order by q.sequence_order),'[]'::jsonb)
 from jsonb_array_elements(w->'questions') x(value) join user_questions q on q.id=(x.value->>'id')::uuid));
end $$;
revoke all on function public.family_journey(uuid) from public,anon;
grant execute on function public.family_journey(uuid) to authenticated;

create function public.family_finish_starting_chapter(p uuid) returns void
language plpgsql security definer set search_path=public,auth as $$
begin
 if not family_subject(p) then raise exception 'Subject access required' using errcode='42501'; end if;
 if not exists(select 1 from experience_contracts where book_project_id=p and payment_confirmed_at is not null
 and refund_confirmed_at is null and production_started_at is not null and production_expires_at>now())
 or not experience_data_allowed(p,true) then raise exception 'Active production required'; end if;
 if not exists(select 1 from user_questions q join answers a on a.user_question_id=q.id
 where q.book_project_id=p and a.book_project_id=p and q.meta_json->>'onboarding_group'='starting_motivation')
 then raise exception 'Finish the starting chapter first'; end if;
 update book_projects set onboarding_ritual_step='chapter_complete',starting_motivation_completed_at=coalesce(starting_motivation_completed_at,now())
 where id=p and coalesce(onboarding_ritual_step,'') not in ('chapter_complete','theme_intro','completed');
end $$;
revoke all on function public.family_finish_starting_chapter(uuid) from public,anon;
grant execute on function public.family_finish_starting_chapter(uuid) to authenticated;
commit;
