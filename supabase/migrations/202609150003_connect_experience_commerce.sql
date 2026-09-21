begin;

alter table public.experience_refund_requests add column execution_started_at timestamptz,
  add column processor_observed_at timestamptz;

-- This wrapper is atomic: payment, contract dates and legacy fulfilment either all commit or none do.
create function public.finalize_experience_order(
 input_order_id uuid, input_checkout_session_id text, input_customer_id text, input_payment_intent_id text,
 input_payment_status text, input_amount_total integer, input_stripe_mode text,
 input_confirmed_at timestamptz, input_currency text
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare c public.experience_contracts%rowtype; o public.commerce_orders%rowtype; result jsonb;
begin
 select * into o from public.commerce_orders where id=input_order_id for update;
 select * into c from public.experience_contracts where order_id=input_order_id for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if c.order_id is not null then
   if input_stripe_mode is distinct from 'test' or input_currency is distinct from 'jpy' then raise exception 'V2 test JPY payment required'; end if;
   if o.stripe_checkout_session_id is not null and o.stripe_checkout_session_id <> input_checkout_session_id then
     raise exception 'Checkout does not belong to this order';
   end if;
   if c.refund_confirmed_at is not null or exists(select 1 from experience_refund_requests where order_id=c.order_id) then
     return jsonb_build_object('order',to_jsonb(o),'contract',to_jsonb(c),'access_stopped',true);
   end if;
   if c.payment_confirmed_at is not null then
     if input_amount_total is distinct from o.amount_total then raise exception 'Payment total mismatch'; end if;
     return jsonb_build_object('order',to_jsonb(o),'contract',to_jsonb(c),
       'gift',(select to_jsonb(g) from gift_orders g where g.commerce_order_id=o.id));
   end if;
 end if;
 result := public.finalize_commerce_order(input_order_id,input_checkout_session_id,input_customer_id,input_payment_intent_id,
   input_payment_status,input_amount_total,input_stripe_mode,input_confirmed_at);
 if c.order_id is not null then
   result := result || jsonb_build_object('contract',public.confirm_experience_payment(input_order_id,input_confirmed_at));
   update gift_orders set guarantee_status=guarantee_status where commerce_order_id=input_order_id;
   result := result || jsonb_build_object('gift',(select to_jsonb(g) from gift_orders g where g.commerce_order_id=input_order_id));
 end if;
 return result;
end; $$;

-- A gift's legacy guarantee fields are a projection for old admin screens, never a second clock.
create function public.project_v2_gift_guarantee() returns trigger language plpgsql security definer set search_path=public,auth as $$
declare c public.experience_contracts%rowtype; paid_at timestamptz;
begin
 select * into c from experience_contracts where order_id=new.commerce_order_id;
 if c.order_id is null then return new; end if;
 new.guarantee_days := c.guarantee_days;
 select purchased_at into paid_at from commerce_orders where id=c.order_id;
 new.guarantee_starts_at := coalesce(c.payment_confirmed_at,paid_at);
 new.guarantee_expires_at := new.guarantee_starts_at + interval '45 days';
 new.guarantee_status := case when c.refund_confirmed_at is not null then 'refunded'
   when c.main_experience_started_at is not null then 'continued'
   when new.guarantee_starts_at is null then 'not_started' else 'eligible' end;
 return new;
end; $$;
create trigger project_v2_gift_guarantee before update on public.gift_orders for each row execute function public.project_v2_gift_guarantee();

create function public.refresh_v2_gift_projection() returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
 update gift_orders set guarantee_status=guarantee_status where commerce_order_id=new.order_id;
 return new;
end; $$;
create trigger refresh_v2_gift_projection after update of payment_confirmed_at,main_experience_started_at,refund_confirmed_at
 on experience_contracts for each row execute function refresh_v2_gift_projection();

create function public.prevent_refunded_access_restore() returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
 if new.access_status in ('paid','gifted','legacy') and exists(select 1 from experience_contracts where book_project_id=new.id and refund_confirmed_at is not null)
  and not exists(select 1 from experience_contracts where book_project_id=new.id and payment_confirmed_at is not null and refund_confirmed_at is null)
  and not exists(select 1 from experience_contracts c join commerce_orders o on o.id=c.order_id
    where c.order_id=new.commerce_order_id and c.book_project_id=new.id and c.refund_confirmed_at is null and o.status in ('paid','zero_paid')) then
   new.access_status := 'refunded';
 end if;
 return new;
end; $$;
create trigger prevent_refunded_access_restore before update of access_status on book_projects
 for each row execute function prevent_refunded_access_restore();
revoke all on function refresh_v2_gift_projection(),prevent_refunded_access_restore() from public,anon,authenticated;

create function public.bind_claimed_v2_gift() returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
 if new.claimed_at is not null and new.recipient_project_id is not null and exists(
   select 1 from experience_contracts where order_id=new.commerce_order_id and payment_confirmed_at is not null
 ) then perform public.bind_gift_experience_contract(new.commerce_order_id); end if;
 return new;
end; $$;
create trigger bind_claimed_v2_gift after update of claimed_at,recipient_project_id on public.gift_orders
 for each row execute function public.bind_claimed_v2_gift();

create or replace function public.track_gift_answer_progress() returns trigger language plpgsql security definer set search_path=public as $$
begin
 update public.gift_orders g set
   first_answer_at=case when new.sequence_order<=3 then coalesce(first_answer_at,now()) else first_answer_at end,
   fourth_answer_at=case when new.sequence_order>=4 then coalesce(fourth_answer_at,now()) else fourth_answer_at end,
   continuation_status=case when new.sequence_order>=4 then 'continue' else continuation_status end,
   guarantee_status=case when new.sequence_order>=4 then 'continued' else guarantee_status end
 where g.recipient_project_id=new.book_project_id
   and not exists(select 1 from experience_contracts c where c.order_id=g.commerce_order_id);
 return new;
end; $$;

-- Before contacting Stripe, reserve a single execution identity. Unknown outcomes keep the same key.
create function public.prepare_experience_refund(input_request_id uuid) returns jsonb
 language plpgsql security definer set search_path=public,auth as $$
declare r public.experience_refund_requests%rowtype; o public.commerce_orders%rowtype;
begin
 select * into r from experience_refund_requests where id=input_request_id for update;
 select * into o from commerce_orders where id=r.order_id;
 if r.id is null or r.identity_review_required then raise exception 'Verified refund request required'; end if;
 if o.stripe_mode is distinct from 'test' or nullif(o.stripe_payment_intent_id,'') is null then raise exception 'Stripe test payment required'; end if;
 if r.stripe_refund_id is null and r.execution_started_at < now()-interval '20 hours' then
   raise exception 'Reconcile the previous attempt before retrying'; -- Stripe may prune keys after 24h.
 end if;
 update experience_refund_requests set execution_started_at=coalesce(execution_started_at,now()) where id=r.id returning * into r;
 return to_jsonb(r)||jsonb_build_object('payment_intent_id',o.stripe_payment_intent_id,'stripe_mode',o.stripe_mode);
end; $$;

create function public.apply_experience_refund_event(input_request_id uuid,input_stripe_refund_id text,input_status text,
 input_amount integer,input_observed_at timestamptz,input_payment_intent_id text) returns jsonb
 language plpgsql security definer set search_path=public,auth as $$
declare r public.experience_refund_requests%rowtype; c public.experience_contracts%rowtype; o public.commerce_orders%rowtype; oid uuid;
begin
 select order_id into oid from experience_refund_requests where id=input_request_id;
 select * into o from commerce_orders where id=oid for update;
 select * into c from experience_contracts where order_id=oid for update;
 select * into r from experience_refund_requests where id=input_request_id for update;
 if o.stripe_mode is distinct from 'test' or o.stripe_payment_intent_id is distinct from input_payment_intent_id then
   raise exception 'Refund payment mismatch';
 end if;
 if input_observed_at is null or input_observed_at>now()+interval '5 minutes'
   or input_observed_at<r.requested_at-interval '5 minutes' then raise exception 'Invalid processor observation time'; end if;
 if input_status not in ('pending','failed','succeeded') or input_status is null
   or r.identity_review_required or r.subject_person_id is null or r.requested_amount is distinct from input_amount
   or nullif(input_stripe_refund_id,'') is null
   or (r.stripe_refund_id is not null and r.stripe_refund_id<>input_stripe_refund_id) then raise exception 'Refund mismatch'; end if;
 if r.processor_observed_at is not null and input_observed_at<r.processor_observed_at then return to_jsonb(r); end if;
 -- A later bank failure is real, not an old pending event. Keep access suspended and require review.
 if r.status='succeeded' and input_status='pending' then return to_jsonb(r); end if;
 update experience_refund_requests set status=input_status,stripe_refund_id=input_stripe_refund_id,
   processor_observed_at=input_observed_at,
   confirmed_at=case when input_status='succeeded' then coalesce(confirmed_at,input_observed_at) else confirmed_at end,
   deletion_review_status=case when input_status='failed' then 'retained' else deletion_review_status end
 where id=r.id returning * into r;
 if input_status='succeeded' then
   update experience_contracts set refund_confirmed_at=coalesce(refund_confirmed_at,r.confirmed_at),
     export_available_until=coalesce(export_available_until,r.confirmed_at+interval '30 days') where order_id=oid;
   perform set_config('app.payment_flow','on',true);
   update book_projects set access_status='refunded' where id=c.book_project_id
     and not exists(select 1 from experience_contracts other where other.book_project_id=c.book_project_id
       and other.order_id<>c.order_id and other.payment_confirmed_at is not null and other.refund_confirmed_at is null);
   -- Full order vs principal-only refund are deliberately different from the production entitlement.
   update commerce_orders set refund_amount=greatest(coalesce(refund_amount,0),input_amount),
     status=case when input_amount>=amount_total then 'refunded' else status end where id=oid;
   update gift_orders set guarantee_status='refunded' where commerce_order_id=oid;
 end if;
 return to_jsonb(r);
end; $$;

-- A restrictive policy adds contract limits to (and never replaces) existing ownership/sharing rules.
create function public.experience_data_allowed(input_project_id uuid,input_write boolean) returns boolean
 language plpgsql stable security definer set search_path=public,auth as $$
declare c public.experience_contracts%rowtype; r public.experience_refund_requests%rowtype;
begin
 select * into c from experience_contracts where book_project_id=input_project_id and payment_confirmed_at is not null
   order by (refund_confirmed_at is null) desc,created_at desc limit 1;
 if c.order_id is null then return true; end if;
 select * into r from experience_refund_requests where order_id=c.order_id;
 if input_write then
   return ((c.production_started_at is null and c.purchase_kind='gift') or now()<=c.production_expires_at)
     and c.refund_confirmed_at is null and r.id is null;
 end if;
 -- Pending/failed refunds do not start or exhaust the 30-day download window.
 return c.refund_confirmed_at is null or r.status='failed' or now()<=c.export_available_until;
end; $$;

create function public.assert_experience_processing(input_project_id uuid,input_actor_id uuid) returns void
 language plpgsql security definer set search_path=public,auth as $$
begin
 if not exists(select 1 from book_projects p where p.id=input_project_id and p.status='active'
   and (p.owner_user_id=input_actor_id or exists(select 1 from project_supporters s where s.book_project_id=p.id
    and s.supporter_user_id=input_actor_id and s.status='active' and s.can_operate_recording))) then raise exception 'Forbidden'; end if;
 if not public.experience_data_allowed(input_project_id,true) then raise exception 'Production access suspended'; end if;
end; $$;

create function public.guard_experience_content_write() returns trigger language plpgsql security definer set search_path=public,auth as $$
declare pid uuid; q public.user_questions%rowtype; c public.experience_contracts%rowtype;
begin
 pid := (to_jsonb(new)->>'book_project_id')::uuid;
 if pid is null and tg_table_name='media_assets' then select book_project_id into pid from answers where id=new.answer_id; end if;
 perform 1 from experience_contracts where book_project_id=pid for update;
 if not public.experience_data_allowed(pid,true) then raise exception 'Production access suspended' using errcode='42501'; end if;
 select * into c from experience_contracts where book_project_id=pid and payment_confirmed_at is not null and refund_confirmed_at is null;
 if c.order_id is not null and c.production_started_at is null then
   if tg_table_name='answers' then select * into q from user_questions where id=new.user_question_id;
   elsif tg_table_name='media_assets' then select uq.* into q from user_questions uq join answers a on a.user_question_id=uq.id where a.id=new.answer_id;
   else raise exception 'Start the paid introduction first'; end if;
   if q.id is null or coalesce(q.meta_json->>'onboarding_group','')<>'trial_experience' then raise exception 'Only the free trial is available before paid introduction'; end if;
 end if;
 if tg_table_name='answers' and exists(select 1 from experience_contracts where book_project_id=pid and payment_confirmed_at is not null) then
   select * into q from user_questions where id=new.user_question_id;
   if q.id is null or q.book_project_id is distinct from pid then raise exception 'Question does not belong to project'; end if;
   if coalesce(q.meta_json->>'onboarding_group','')<>'trial_experience' and (q.sequence_order is null or q.sequence_order>4)
     and not exists(select 1 from experience_contracts where book_project_id=pid and main_experience_started_at is not null and refund_confirmed_at is null) then
     raise exception 'Explicit main experience start required' using errcode='42501';
   end if;
 end if;
 return new;
end; $$;
create trigger guard_experience_answers before insert or update on answers for each row execute function guard_experience_content_write();
create trigger guard_experience_assets before insert or update on media_assets for each row execute function guard_experience_content_write();
create trigger guard_experience_videos before insert or update on video_stories for each row execute function guard_experience_content_write();
create trigger guard_experience_cover before insert or update on book_cover_settings for each row execute function guard_experience_content_write();

create policy experience_answers_read on answers as restrictive for select to authenticated using(experience_data_allowed(book_project_id,false));
create policy experience_assets_read on media_assets as restrictive for select to authenticated using(experience_data_allowed(book_project_id,false));
create policy experience_videos_read on video_stories as restrictive for select to authenticated using(experience_data_allowed(book_project_id,false));

create trigger guard_experience_introduction before insert or update on project_introductions
 for each row execute function guard_experience_content_write();
create policy experience_introduction_read on project_introductions as restrictive for select to authenticated using(experience_data_allowed(book_project_id,false));

create function public.list_my_experience_contracts() returns jsonb language sql stable security definer set search_path=public,auth as $$
 select coalesce(jsonb_agg(jsonb_build_object('order_id',c.order_id,'book_project_id',c.book_project_id,
  'purchase_kind',c.purchase_kind,'base_paid_amount',c.base_paid_amount,'guarantee_days',c.guarantee_days,
  'guarantee_expires_at',c.guarantee_expires_at,'main_started_at',c.main_experience_started_at,
  'refund_status',r.status,'export_available_until',c.export_available_until,
  'guarantee_previously_used',exists(select 1 from experience_refund_requests prior where prior.subject_person_id=c.subject_person_id and prior.order_id<>c.order_id),
  'is_purchaser',c.purchaser_user_id=auth.uid(),'is_owner',p.owner_user_id=auth.uid(),
  'can_request_refund',c.purchaser_user_id=auth.uid() and c.base_paid_amount>0 and c.main_experience_started_at is null
   and c.refund_confirmed_at is null and (now()<=c.guarantee_expires_at or r.id is not null)
   and not exists(select 1 from experience_refund_requests prior where prior.subject_person_id=c.subject_person_id and prior.order_id<>c.order_id)
 ) order by c.created_at desc),'[]'::jsonb)
 from experience_contracts c left join book_projects p on p.id=c.book_project_id
 left join experience_refund_requests r on r.order_id=c.order_id
 where auth.uid() is not null and c.payment_confirmed_at is not null
  and (c.purchaser_user_id=auth.uid() or p.owner_user_id=auth.uid());
$$;
revoke all on function list_my_experience_contracts() from public,anon;
grant execute on function list_my_experience_contracts() to authenticated;

-- The first scaffold's result writer did not update production rights. Only the integrated writer may be called now.
revoke execute on function record_experience_refund_result(uuid,text,text,integer,timestamptz) from service_role;

revoke all on function finalize_experience_order(uuid,text,text,text,text,integer,text,timestamptz,text),
 prepare_experience_refund(uuid),apply_experience_refund_event(uuid,text,text,integer,timestamptz,text),
 assert_experience_processing(uuid,uuid),project_v2_gift_guarantee(),bind_claimed_v2_gift(),guard_experience_content_write() from public,anon,authenticated;
grant execute on function finalize_experience_order(uuid,text,text,text,text,integer,text,timestamptz,text),
 prepare_experience_refund(uuid),apply_experience_refund_event(uuid,text,text,integer,timestamptz,text),assert_experience_processing(uuid,uuid) to service_role;
revoke all on function experience_data_allowed(uuid,boolean) from public,anon;
grant execute on function experience_data_allowed(uuid,boolean) to authenticated,service_role;
commit;
