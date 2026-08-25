begin;

alter table public.book_cover_settings
  drop constraint if exists book_cover_settings_standard_extra_copy_count_check,
  drop constraint if exists book_cover_settings_premium_copy_count_check;
alter table public.book_cover_settings
  add constraint book_cover_settings_standard_extra_copy_count_check check (
    standard_extra_copy_count = 0 or standard_extra_copy_count between 2 and 30
  ),
  add constraint book_cover_settings_premium_copy_count_check check (
    premium_copy_count between 0 and 30
  );

alter table public.book_projects
  drop constraint if exists book_projects_ordered_standard_extra_copy_count_check,
  drop constraint if exists book_projects_ordered_premium_copy_count_check;
alter table public.book_projects
  add constraint book_projects_ordered_standard_extra_copy_count_check check (
    ordered_standard_extra_copy_count = 0 or ordered_standard_extra_copy_count between 2 and 30
  ),
  add constraint book_projects_ordered_premium_copy_count_check check (
    ordered_premium_copy_count between 0 and 30
  );

alter table public.commerce_orders
  drop constraint if exists commerce_orders_standard_extra_copy_count_check,
  drop constraint if exists commerce_orders_premium_copy_count_check,
  drop constraint if exists commerce_orders_requested_standard_extra_copy_count_check,
  drop constraint if exists commerce_orders_requested_premium_copy_count_check;
alter table public.commerce_orders
  add constraint commerce_orders_standard_extra_copy_count_check check (
    standard_extra_copy_count between 0 and 30
  ),
  add constraint commerce_orders_premium_copy_count_check check (
    premium_copy_count between 0 and 30
  ),
  add constraint commerce_orders_requested_standard_extra_copy_count_check check (
    requested_standard_extra_copy_count = 0 or requested_standard_extra_copy_count between 2 and 30
  ),
  add constraint commerce_orders_requested_premium_copy_count_check check (
    requested_premium_copy_count between 0 and 30
  );

create or replace function public.standard_reprint_price(input_count integer)
returns integer language sql immutable as $$
  select case
    when coalesce(input_count, 0) = 0 then 0
    when input_count between 2 and 30 then 10000 + ((input_count - 2) * 4000)
    else null
  end;
$$;

create or replace function public.get_book_order_quote(
  input_book_project_id uuid,
  input_discount_code text default null,
  input_standard_extra_copy_count integer default 0,
  input_premium_copy_count integer default 0,
  input_include_gift_package boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  project_row public.book_projects%rowtype;
  base_product public.commerce_products%rowtype;
  premium_product public.commerce_products%rowtype;
  package_product public.commerce_products%rowtype;
  code_row public.discount_codes%rowtype;
  campaign_row public.discount_campaigns%rowtype;
  normalized text := public.normalize_discount_code(input_discount_code);
  base_purchased boolean := false;
  base_amount integer := 0;
  requested_standard integer := coalesce(input_standard_extra_copy_count, 0);
  requested_premium integer := coalesce(input_premium_copy_count, 0);
  ordered_standard integer := 0;
  ordered_premium integer := 0;
  standard_amount integer := 0;
  premium_amount integer := 0;
  package_amount integer := 0;
  discount_amount integer := 0;
  campaign_used integer := 0;
  standard_due_count integer := 0;
  premium_due_count integer := 0;
  pair_quantity integer := 0;
  additional_quantity integer := 0;
begin
  if requested_standard <> 0 and requested_standard not between 2 and 30 then
    raise exception 'スタンダード冊子の増刷は2冊から30冊で指定してください' using errcode = '22023';
  end if;
  if requested_premium not between 0 and 30 then
    raise exception 'プレミアム冊子は0冊から30冊で指定してください' using errcode = '22023';
  end if;

  select * into project_row from public.book_projects where id = input_book_project_id;
  if project_row.id is null then raise exception '物語が見つかりません' using errcode = 'P0002'; end if;
  if auth.role() <> 'service_role' and not public.can_manage_book_cover(project_row.id) then
    raise exception 'この物語の注文情報を確認できません' using errcode = '42501';
  end if;

  select * into base_product from public.commerce_products where product_code = 'self_book_v1' and is_active = true;
  select * into premium_product from public.commerce_products where product_code = 'premium_hardcover_v1' and is_active = true;
  select * into package_product from public.commerce_products where product_code = 'gift_package_v1' and is_active = true;
  if base_product.product_code is null or premium_product.product_code is null or package_product.product_code is null then
    raise exception '商品が見つかりません' using errcode = 'P0002';
  end if;

  base_purchased := project_row.access_status in ('paid', 'gifted', 'legacy');
  ordered_standard := coalesce(project_row.ordered_standard_extra_copy_count, 0);
  ordered_premium := coalesce(project_row.ordered_premium_copy_count, 0);
  if requested_standard < ordered_standard or requested_premium < ordered_premium then
    raise exception '購入済みの冊数より少ない冊数には変更できません' using errcode = '22023';
  end if;

  base_amount := case when base_purchased then 0 else base_product.amount_jpy end;
  standard_amount := coalesce(public.standard_reprint_price(requested_standard), 0)
    - coalesce(public.standard_reprint_price(ordered_standard), 0);
  premium_amount := (requested_premium - ordered_premium) * premium_product.amount_jpy;
  package_amount := case
    when input_include_gift_package and not project_row.gift_package_purchased then package_product.amount_jpy
    else 0
  end;
  standard_due_count := requested_standard - ordered_standard;
  premium_due_count := requested_premium - ordered_premium;
  if ordered_standard = 0 and requested_standard >= 2 then
    pair_quantity := 1;
    additional_quantity := requested_standard - 2;
  elsif standard_due_count > 0 then
    additional_quantity := standard_due_count;
  end if;

  if normalized <> '' then
    if base_amount = 0 then
      raise exception '基本パッケージは購入済みのため、この注文に割引コードは利用できません' using errcode = '22023';
    end if;
    select c.* into code_row from public.discount_codes c where c.normalized_code = normalized and c.is_active = true;
    if code_row.id is null then raise exception '割引コードを確認できません' using errcode = '22023'; end if;
    select * into campaign_row from public.discount_campaigns where id = code_row.campaign_id;
    if campaign_row.status not in ('active', 'scheduled')
      or (campaign_row.starts_at is not null and campaign_row.starts_at > now())
      or (campaign_row.ends_at is not null and campaign_row.ends_at <= now())
      or (code_row.expires_at is not null and code_row.expires_at <= now()) then
      raise exception 'この割引コードは現在利用できません' using errcode = '22023';
    end if;
    if campaign_row.product_code <> 'self_book_v1' then raise exception 'この商品には利用できない割引コードです' using errcode = '22023'; end if;
    if code_row.max_redemptions is not null and code_row.redemption_count >= code_row.max_redemptions then
      raise exception 'この割引コードは使用済みです' using errcode = '22023';
    end if;
    if campaign_row.max_redemptions is not null then
      select count(*) into campaign_used from public.discount_redemptions
      where campaign_id = campaign_row.id and status in ('pending', 'redeemed');
      if campaign_used >= campaign_row.max_redemptions then raise exception 'このキャンペーンは終了しました' using errcode = '22023'; end if;
    end if;
    if campaign_row.one_per_account and auth.uid() is not null and exists (
      select 1 from public.discount_redemptions
      where campaign_id = campaign_row.id and purchaser_user_id = auth.uid() and status = 'redeemed'
    ) then raise exception 'この割引は1アカウントにつき1回利用できます' using errcode = '22023'; end if;
    discount_amount := case campaign_row.discount_type
      when 'full' then base_amount
      when 'percent' then round(base_amount * campaign_row.discount_value / 100.0)::integer
      else least(base_amount, campaign_row.discount_value::integer)
    end;
  end if;

  return jsonb_build_object(
    'base_product_code', base_product.product_code,
    'base_product_name', base_product.display_name,
    'base_catalog_amount', base_product.amount_jpy,
    'base_already_purchased', base_purchased,
    'includes_base_book', not base_purchased,
    'base_book_amount', base_amount,
    'standard_extra_copy_count', requested_standard,
    'standard_extra_copy_count_already_purchased', ordered_standard,
    'standard_extra_copy_count_due', standard_due_count,
    'standard_reprint_catalog_amount', public.standard_reprint_price(requested_standard),
    'standard_reprint_amount', standard_amount,
    'standard_reprint_pair_quantity', pair_quantity,
    'standard_reprint_additional_quantity', additional_quantity,
    'premium_copy_count', requested_premium,
    'premium_copy_count_already_purchased', ordered_premium,
    'premium_copy_count_due', premium_due_count,
    'premium_catalog_amount', requested_premium * premium_product.amount_jpy,
    'premium_hardcover_amount', premium_amount,
    'include_premium_hardcover', requested_premium > 0,
    'includes_premium_hardcover', premium_due_count > 0,
    'gift_package_selected', input_include_gift_package,
    'gift_package_already_purchased', project_row.gift_package_purchased,
    'gift_package_amount', package_amount,
    'configuration_total', base_product.amount_jpy + public.standard_reprint_price(requested_standard)
      + (requested_premium * premium_product.amount_jpy)
      + case when input_include_gift_package then package_product.amount_jpy else 0 end,
    'amount_subtotal', base_amount + standard_amount + premium_amount,
    'discount_amount', discount_amount,
    'amount_total', base_amount + standard_amount + premium_amount - discount_amount + package_amount,
    'book_count', 1 + requested_standard + requested_premium,
    'currency', 'jpy',
    'tax_included', true,
    'domestic_shipping_included', true,
    'discount_code_id', code_row.id,
    'discount_code', code_row.code,
    'campaign_id', campaign_row.id,
    'campaign_name', campaign_row.name
  );
end;
$$;

revoke all on function public.standard_reprint_price(integer) from public;
revoke all on function public.get_book_order_quote(uuid, text, integer, integer, boolean) from public;
grant execute on function public.standard_reprint_price(integer) to authenticated, service_role;
grant execute on function public.get_book_order_quote(uuid, text, integer, integer, boolean) to authenticated, service_role;

commit;
