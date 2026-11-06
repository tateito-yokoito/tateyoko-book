-- The 45-day Phase 2 gift guarantee covers the entire amount actually paid
-- for the initial order, including extra copies and production options.
-- Legacy guarantees retain their original principal/package calculation.
create or replace function public.request_experience_refund(input_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare
  c public.experience_contracts%rowtype;
  r public.experience_refund_requests%rowtype;
  g public.gift_orders%rowtype;
  o public.commerce_orders%rowtype;
  package_refund integer := 0;
  full_order_guarantee boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into c from public.experience_contracts
    where order_id = input_order_id for update;
  if c.order_id is null or c.purchaser_user_id <> auth.uid() then
    raise exception 'Only the purchaser may request a refund' using errcode = '42501';
  end if;
  select * into r from public.experience_refund_requests
    where order_id = input_order_id;
  if r.id is not null then return to_jsonb(r); end if;
  if c.subject_person_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(c.subject_person_id::text, 0));
  end if;
  select * into o from public.commerce_orders where id = input_order_id;
  full_order_guarantee := c.policy_version = '2.0'
    and c.purchase_kind = 'gift' and c.guarantee_days = 45;
  if c.payment_confirmed_at is null or c.refund_confirmed_at is not null
    or (case when full_order_guarantee then coalesce(o.amount_total, 0) = 0
             else c.base_paid_amount = 0 end)
    or c.main_experience_started_at is not null
    or now() > c.guarantee_expires_at then
    raise exception 'This order is not eligible for the voluntary guarantee';
  end if;
  if exists (select 1 from public.experience_refund_requests
      where subject_person_id = c.subject_person_id) then
    raise exception 'This subject already has a guarantee request';
  end if;
  if full_order_guarantee then
    -- Do not attempt a second automatic refund after a separate partial refund.
    -- Operations must reconcile that payment before the remaining balance is returned.
    if coalesce(o.refund_amount, 0) > 0 then
      raise exception 'An existing partial refund requires review';
    end if;
    insert into public.experience_refund_requests(
      order_id, subject_person_id, requested_by,
      base_amount, requested_amount, identity_review_required
    ) values (
      c.order_id, c.subject_person_id, auth.uid(),
      c.base_paid_amount, o.amount_total, c.subject_person_id is null
    ) returning * into r;
  else
    select * into g from public.gift_orders where commerce_order_id = input_order_id;
    if o.gift_package_amount > 0 then
      if g.id is null then raise exception 'Physical option fulfilment needs review'; end if;
      if g.package_status not in ('shipped', 'delivered') then
        package_refund := least(o.gift_package_amount,
          greatest(0, o.amount_total - c.base_paid_amount));
      end if;
    end if;
    insert into public.experience_refund_requests(
      order_id, subject_person_id, requested_by,
      base_amount, requested_amount, identity_review_required
    ) values (
      c.order_id, c.subject_person_id, auth.uid(),
      c.base_paid_amount, c.base_paid_amount + package_refund,
      c.subject_person_id is null
    ) returning * into r;
  end if;
  return to_jsonb(r);
end;
$$;

create or replace function public.list_my_experience_contracts()
returns jsonb
language sql stable security definer set search_path = public, auth
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id', c.order_id, 'book_project_id', c.book_project_id,
    'purchase_kind', c.purchase_kind, 'base_paid_amount', c.base_paid_amount,
    'guarantee_days', c.guarantee_days,
    'full_order_guarantee', c.policy_version = '2.0'
      and c.purchase_kind = 'gift' and c.guarantee_days = 45,
    'guarantee_expires_at', c.guarantee_expires_at,
    'main_started_at', c.main_experience_started_at,
    'refund_status', r.status,
    'export_available_until', c.export_available_until,
    'guarantee_previously_used', exists(
      select 1 from public.experience_refund_requests prior
      where prior.subject_person_id = c.subject_person_id
        and prior.order_id <> c.order_id),
    'is_purchaser', c.purchaser_user_id = auth.uid(),
    'is_owner', p.owner_user_id = auth.uid(),
    'can_request_refund', c.purchaser_user_id = auth.uid()
      and (case when c.policy_version = '2.0'
                      and c.purchase_kind = 'gift'
                      and c.guarantee_days = 45
                then o.amount_total > 0 and coalesce(o.refund_amount, 0) = 0
                else c.base_paid_amount > 0 end)
      and c.main_experience_started_at is null
      and c.refund_confirmed_at is null
      and (now() <= c.guarantee_expires_at or r.id is not null)
      and not exists(
        select 1 from public.experience_refund_requests prior
        where prior.subject_person_id = c.subject_person_id
          and prior.order_id <> c.order_id)
  ) order by c.created_at desc), '[]'::jsonb)
  from public.experience_contracts c
  join public.commerce_orders o on o.id = c.order_id
  left join public.book_projects p on p.id = c.book_project_id
  left join public.experience_refund_requests r on r.order_id = c.order_id
  where auth.uid() is not null and c.payment_confirmed_at is not null
    and (c.purchaser_user_id = auth.uid() or p.owner_user_id = auth.uid());
$$;
