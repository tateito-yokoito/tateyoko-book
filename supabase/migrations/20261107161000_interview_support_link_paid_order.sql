-- A paid support order can be matched to the separately submitted consultation
-- by an active owner after verifying the customer and order number. Keep the
-- association atomic so staff access cannot point at a different order.
create function public.link_paid_interview_consultation(
  input_admin_user_id uuid, input_consultation_id uuid, input_order_number text
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  consultation public.commerce_v2_consultations%rowtype;
  purchase public.commerce_orders%rowtype;
begin
  if not exists (select 1 from public.admin_users
    where user_id = input_admin_user_id and role = 'owner' and is_active = true) then
    raise exception '管理権限がありません' using errcode = '42501';
  end if;
  select * into consultation from public.commerce_v2_consultations
    where id = input_consultation_id for update;
  select * into purchase from public.commerce_orders
    where order_number = btrim(input_order_number) for update;
  if consultation.id is null or purchase.id is null
    or consultation.status not in ('submitted', 'in_review')
    or consultation.order_id is not null
    or purchase.pricing_version is distinct from 'v2'
    or purchase.production_method_v2 is distinct from 'interview_staff'
    or purchase.status not in ('paid', 'zero_paid')
    or purchase.consultation_id_v2 is not null
    or (consultation.requester_user_id is not null
      and consultation.requester_user_id is distinct from purchase.purchaser_user_id)
    or (consultation.product_preference <> 'undecided'
      and consultation.product_preference is distinct from purchase.edition_v2)
    or exists (select 1 from public.experience_refund_requests
      where order_id = purchase.id) then
    raise exception '相談と決済済み注文を照合できません' using errcode = '22023';
  end if;
  update public.commerce_orders set consultation_id_v2 = consultation.id
    where id = purchase.id;
  update public.commerce_v2_consultations set
    requester_user_id = purchase.purchaser_user_id,
    order_type = purchase.order_type,
    agreed_edition = purchase.edition_v2,
    agreed_at = now(),
    order_id = purchase.id,
    status = 'paid',
    updated_at = now()
    where id = consultation.id;
  return jsonb_build_object('consultation_id', consultation.id,
    'order_id', purchase.id, 'order_number', purchase.order_number);
end;
$$;
revoke all on function public.link_paid_interview_consultation(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.link_paid_interview_consultation(uuid,uuid,text)
  to service_role;

