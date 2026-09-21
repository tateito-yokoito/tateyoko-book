begin;
create table public.commerce_environment (
 singleton boolean primary key default true check(singleton),
 stripe_mode text not null default 'disabled' check(stripe_mode in('disabled','test','live'))
);
insert into public.commerce_environment values(true,'disabled');
alter table public.commerce_environment enable row level security;
revoke all on public.commerce_environment from public,anon,authenticated;
grant select on public.commerce_environment to service_role;
create function public.require_commerce_mode(input_mode text) returns void language plpgsql
security definer set search_path=public as $$
begin
 if input_mode is null or input_mode not in('test','live') or input_mode is distinct from
  (select stripe_mode from commerce_environment where singleton) then
  raise exception 'Commerce database mode mismatch or disabled';
 end if;
end; $$;
revoke all on function public.require_commerce_mode(text) from public,anon,authenticated;
grant execute on function public.require_commerce_mode(text) to service_role;
create or replace function public.finalize_experience_order(
 input_order_id uuid, input_checkout_session_id text, input_customer_id text, input_payment_intent_id text,
 input_payment_status text, input_amount_total integer, input_stripe_mode text,
 input_confirmed_at timestamptz, input_currency text
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare c public.experience_contracts%rowtype; o public.commerce_orders%rowtype; result jsonb;
begin
 select * into o from public.commerce_orders where id=input_order_id for update;
 select * into c from public.experience_contracts where order_id=input_order_id for update;
 if o.id is null then raise exception 'Order not found'; end if;
 perform public.require_commerce_mode(input_stripe_mode);
 if o.stripe_mode is not null and o.stripe_mode is distinct from input_stripe_mode then raise exception 'Order Stripe mode mismatch'; end if;
 if c.order_id is not null then
   perform public.require_commerce_mode(input_stripe_mode);
   if input_currency is distinct from 'jpy' then raise exception 'JPY payment required'; end if;
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
create or replace function public.prepare_experience_refund(input_request_id uuid) returns jsonb
 language plpgsql security definer set search_path=public,auth as $$
declare r public.experience_refund_requests%rowtype; o public.commerce_orders%rowtype;
begin
 select * into r from experience_refund_requests where id=input_request_id for update;
 select * into o from commerce_orders where id=r.order_id;
 if r.id is null or r.identity_review_required then raise exception 'Verified refund request required'; end if;
 perform public.require_commerce_mode(o.stripe_mode);
 if nullif(o.stripe_payment_intent_id,'') is null then raise exception 'Stripe payment required'; end if;
 if r.stripe_refund_id is null and r.execution_started_at < now()-interval '20 hours' then
   raise exception 'Reconcile the previous attempt before retrying'; -- Stripe may prune keys after 24h.
 end if;
 update experience_refund_requests set execution_started_at=coalesce(execution_started_at,now()) where id=r.id returning * into r;
 return to_jsonb(r)||jsonb_build_object('payment_intent_id',o.stripe_payment_intent_id,'stripe_mode',o.stripe_mode);
end; $$;
create or replace function public.apply_experience_refund_event(input_request_id uuid,input_stripe_refund_id text,input_status text,
 input_amount integer,input_observed_at timestamptz,input_payment_intent_id text) returns jsonb
 language plpgsql security definer set search_path=public,auth as $$
declare r public.experience_refund_requests%rowtype; c public.experience_contracts%rowtype; o public.commerce_orders%rowtype; oid uuid;
begin
 select order_id into oid from experience_refund_requests where id=input_request_id;
 select * into o from commerce_orders where id=oid for update;
 select * into c from experience_contracts where order_id=oid for update;
 select * into r from experience_refund_requests where id=input_request_id for update;
 perform public.require_commerce_mode(o.stripe_mode);
 if o.stripe_payment_intent_id is distinct from input_payment_intent_id then
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
commit;
