begin;

create or replace function public.create_book_commerce_order(
  input_purchaser_user_id uuid,
  input_book_project_id uuid,
  input_discount_code text,
  input_standard_extra_copy_count integer,
  input_premium_copy_count integer,
  input_include_gift_package boolean,
  input_shipping_address jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  quote jsonb;
  code_row public.discount_codes%rowtype;
  campaign_row public.discount_campaigns%rowtype;
  order_row public.commerce_orders%rowtype;
  reservation_minutes integer := 60;
  used_count integer;
  snapshot jsonb := '{}'::jsonb;
begin
  if input_purchaser_user_id is null then raise exception '購入者が必要です'; end if;
  if not exists (
    select 1 from public.book_projects where id = input_book_project_id and owner_user_id = input_purchaser_user_id
  ) then raise exception 'この物語の購入手続きを開始できません' using errcode = '42501'; end if;

  select coalesce(integer_value, 60) into reservation_minutes
  from public.commerce_settings where setting_key = 'checkout_reservation_minutes';
  update public.commerce_orders set status = 'expired'
  where status = 'checkout_pending' and created_at < now() - make_interval(mins => reservation_minutes);
  update public.discount_redemptions r set status = 'released'
  where status = 'pending' and exists (
    select 1 from public.commerce_orders o where o.id = r.commerce_order_id and o.status = 'expired'
  );

  quote := public.get_book_order_quote(
    input_book_project_id, input_discount_code, input_standard_extra_copy_count,
    input_premium_copy_count, input_include_gift_package
  );

  if quote ->> 'discount_code_id' is not null then
    select * into code_row from public.discount_codes where id = (quote ->> 'discount_code_id')::uuid for update;
    select * into campaign_row from public.discount_campaigns where id = code_row.campaign_id for update;
    select count(*) into used_count from public.discount_redemptions
    where discount_code_id = code_row.id and status in ('pending', 'redeemed');
    if code_row.max_redemptions is not null and used_count >= code_row.max_redemptions then
      raise exception 'この割引コードは使用中または使用済みです' using errcode = '22023';
    end if;
    if campaign_row.one_per_account and exists (
      select 1 from public.discount_redemptions
      where campaign_id = code_row.campaign_id and purchaser_user_id = input_purchaser_user_id and status in ('pending', 'redeemed')
    ) then raise exception 'この割引は1アカウントにつき1回利用できます' using errcode = '22023'; end if;
  end if;

  select coalesce(
    (
      select to_jsonb(s)
      from public.book_cover_settings s
      where s.book_project_id = input_book_project_id
      limit 1
    ),
    '{}'::jsonb
  ) into snapshot;

  insert into public.commerce_orders(
    purchaser_user_id, book_project_id, order_type, product_code,
    amount_subtotal, gift_package_amount, discount_amount, amount_total,
    currency, discount_code_id, status,
    includes_base_book, includes_premium_hardcover,
    base_book_amount, premium_hardcover_amount, design_snapshot,
    standard_extra_copy_count, premium_copy_count,
    requested_standard_extra_copy_count, requested_premium_copy_count,
    gift_package_selected, shipping_address
  ) values (
    input_purchaser_user_id, input_book_project_id, 'self', 'self_book_v1',
    (quote ->> 'amount_subtotal')::integer, (quote ->> 'gift_package_amount')::integer,
    (quote ->> 'discount_amount')::integer, (quote ->> 'amount_total')::integer,
    'jpy', nullif(quote ->> 'discount_code_id', '')::uuid, 'checkout_pending',
    coalesce((quote ->> 'includes_base_book')::boolean, false),
    coalesce((quote ->> 'includes_premium_hardcover')::boolean, false),
    (quote ->> 'base_book_amount')::integer, (quote ->> 'premium_hardcover_amount')::integer, snapshot,
    (quote ->> 'standard_extra_copy_count_due')::integer,
    (quote ->> 'premium_copy_count_due')::integer,
    (quote ->> 'standard_extra_copy_count')::integer,
    (quote ->> 'premium_copy_count')::integer,
    coalesce((quote ->> 'gift_package_selected')::boolean, false),
    coalesce(input_shipping_address, '{}'::jsonb)
  ) returning * into order_row;

  if code_row.id is not null then
    insert into public.discount_redemptions(
      discount_code_id, campaign_id, commerce_order_id, purchaser_user_id, amount_discounted
    ) values (
      code_row.id, code_row.campaign_id, order_row.id, input_purchaser_user_id,
      (quote ->> 'discount_amount')::integer
    );
  end if;

  return jsonb_build_object('order', to_jsonb(order_row), 'quote', quote);
end;
$$;

revoke all on function public.create_book_commerce_order(uuid, uuid, text, integer, integer, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_book_commerce_order(uuid, uuid, text, integer, integer, boolean, jsonb)
  to service_role;

commit;
