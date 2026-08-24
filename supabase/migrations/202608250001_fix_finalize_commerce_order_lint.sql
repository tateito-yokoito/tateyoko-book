begin;

create or replace function public.finalize_commerce_order(
  input_order_id uuid,
  input_checkout_session_id text,
  input_customer_id text,
  input_payment_intent_id text,
  input_payment_status text,
  input_amount_total integer,
  input_stripe_mode text,
  input_purchased_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  order_row public.commerce_orders%rowtype;
  gift_row public.gift_orders%rowtype;
  redemption_row public.discount_redemptions%rowtype;
  next_status text;
  gift_guarantee_days integer := 40;
begin
  select * into order_row from public.commerce_orders where id = input_order_id for update;
  if order_row.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if input_payment_status not in ('paid', 'no_payment_required') then raise exception 'Payment is not complete'; end if;
  if input_amount_total is distinct from order_row.amount_total then raise exception 'Payment total does not match order'; end if;
  next_status := case when input_payment_status = 'no_payment_required' or order_row.amount_total = 0 then 'zero_paid' else 'paid' end;

  update public.commerce_orders set
    status = next_status,
    stripe_checkout_session_id = input_checkout_session_id,
    stripe_customer_id = nullif(input_customer_id, ''),
    stripe_payment_intent_id = nullif(input_payment_intent_id, ''),
    stripe_mode = input_stripe_mode,
    purchased_at = coalesce(purchased_at, input_purchased_at, now())
  where id = order_row.id returning * into order_row;

  select * into redemption_row from public.discount_redemptions
  where commerce_order_id = order_row.id for update;
  if redemption_row.id is not null and redemption_row.status = 'pending' then
    update public.discount_redemptions set status = 'redeemed', redeemed_at = now() where id = redemption_row.id;
    update public.discount_codes set redemption_count = redemption_count + 1, last_redeemed_at = now()
    where id = redemption_row.discount_code_id;
  end if;

  if order_row.order_type = 'self' and order_row.book_project_id is not null then
    perform set_config('app.payment_flow', 'on', true);
    if order_row.includes_base_book then
      update public.book_projects set
        access_status = 'paid',
        purchased_at = coalesce(purchased_at, order_row.purchased_at),
        purchaser_user_id = order_row.purchaser_user_id,
        stripe_checkout_session_id = input_checkout_session_id,
        stripe_customer_id = nullif(input_customer_id, ''),
        stripe_payment_intent_id = nullif(input_payment_intent_id, ''),
        commerce_order_id = order_row.id
      where id = order_row.book_project_id;
    end if;
    if order_row.includes_premium_hardcover then
      update public.book_projects set
        premium_hardcover_status = 'paid',
        premium_hardcover_purchased_at = coalesce(premium_hardcover_purchased_at, order_row.purchased_at),
        premium_hardcover_order_id = order_row.id
      where id = order_row.book_project_id;
    end if;
  else
    select coalesce(integer_value, 40) into gift_guarantee_days
    from public.commerce_settings where setting_key = 'gift_guarantee_days';
    select * into gift_row from public.gift_orders where commerce_order_id = order_row.id;
    if gift_row.id is not null and not gift_row.package_selected then
      update public.gift_orders set
        guarantee_starts_at = coalesce(guarantee_starts_at, order_row.purchased_at),
        guarantee_expires_at = coalesce(guarantee_expires_at, order_row.purchased_at + make_interval(days => gift_guarantee_days)),
        guarantee_status = case when guarantee_status = 'not_started' then 'eligible' else guarantee_status end
      where id = gift_row.id returning * into gift_row;
    end if;
  end if;

  return jsonb_build_object(
    'order', to_jsonb(order_row),
    'gift', case when gift_row.id is null then null else to_jsonb(gift_row) end
  );
end;
$$;

revoke all on function public.finalize_commerce_order(uuid, text, text, text, text, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.finalize_commerce_order(uuid, text, text, text, text, integer, text, timestamptz)
  to service_role;

commit;
