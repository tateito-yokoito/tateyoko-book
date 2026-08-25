begin;

insert into public.commerce_products(product_code, display_name, description, amount_jpy, domestic_shipping_included)
values
  ('standard_reprint_pair_v1', '縦糸横糸ブック-スタンダード冊子 増刷2冊', 'スタンダード冊子を2冊追加', 10000, true),
  ('standard_reprint_additional_v1', '縦糸横糸ブック-スタンダード冊子 追加増刷', '増刷3冊目以降のスタンダード冊子1冊', 4000, true)
on conflict (product_code) do update
set display_name = excluded.display_name,
    description = excluded.description,
    amount_jpy = excluded.amount_jpy,
    domestic_shipping_included = true,
    is_active = true,
    updated_at = now();

update public.commerce_products
set display_name = '縦糸横糸ブック 基本パッケージ',
    description = '1〜3か月の語り体験、縦糸横糸ブック-スタンダード冊子1冊、電子冊子、QR音声再生',
    amount_jpy = 49800,
    domestic_shipping_included = true,
    updated_at = now()
where product_code = 'self_book_v1';

update public.commerce_products
set display_name = '縦糸横糸ブック-プレミアム冊子',
    description = '布張りまたはプリント表紙のハードカバー上製本1冊',
    amount_jpy = 30000,
    domestic_shipping_included = true,
    updated_at = now()
where product_code = 'premium_hardcover_v1';

update public.commerce_products
set display_name = 'ギフトパッケージ',
    description = 'ブランドコンセプトブック、使い方、メッセージカード、包装',
    amount_jpy = 3000,
    domestic_shipping_included = true,
    updated_at = now()
where product_code = 'gift_package_v1';

alter table public.book_cover_settings
  add column if not exists standard_extra_copy_count integer not null default 0,
  add column if not exists premium_copy_count integer not null default 0,
  add column if not exists include_gift_package boolean not null default false,
  add column if not exists premium_title text,
  add column if not exists premium_subtitle text,
  add column if not exists premium_footer_text text,
  add column if not exists premium_cover_style text,
  add column if not exists premium_cloth_color text,
  add column if not exists premium_print_color text,
  add column if not exists premium_cover_photo_mode text not null default 'inherit',
  add column if not exists premium_cover_photo_path text,
  add column if not exists premium_cover_photo_transform jsonb;

alter table public.book_cover_settings
  drop constraint if exists book_cover_settings_standard_extra_copy_count_check,
  drop constraint if exists book_cover_settings_premium_copy_count_check,
  drop constraint if exists book_cover_settings_premium_cover_style_check,
  drop constraint if exists book_cover_settings_premium_cover_photo_mode_check;
alter table public.book_cover_settings
  add constraint book_cover_settings_standard_extra_copy_count_check check (
    standard_extra_copy_count = 0 or standard_extra_copy_count between 2 and 10
  ),
  add constraint book_cover_settings_premium_copy_count_check check (premium_copy_count between 0 and 10),
  add constraint book_cover_settings_premium_cover_style_check check (
    premium_cover_style is null or premium_cover_style in ('cloth', 'print')
  ),
  add constraint book_cover_settings_premium_cover_photo_mode_check check (
    premium_cover_photo_mode in ('inherit', 'custom', 'none')
  );

update public.book_cover_settings
set premium_copy_count = greatest(premium_copy_count, 1),
    premium_cover_style = coalesce(premium_cover_style, cover_style),
    premium_cloth_color = coalesce(premium_cloth_color, cloth_color),
    premium_print_color = coalesce(premium_print_color, print_color),
    cover_style = 'print'
where premium_hardcover_selected = true;

alter table public.book_projects
  add column if not exists ordered_standard_extra_copy_count integer not null default 0,
  add column if not exists ordered_premium_copy_count integer not null default 0,
  add column if not exists gift_package_purchased boolean not null default false;

alter table public.book_projects
  drop constraint if exists book_projects_ordered_standard_extra_copy_count_check,
  drop constraint if exists book_projects_ordered_premium_copy_count_check;
alter table public.book_projects
  add constraint book_projects_ordered_standard_extra_copy_count_check check (
    ordered_standard_extra_copy_count = 0 or ordered_standard_extra_copy_count between 2 and 10
  ),
  add constraint book_projects_ordered_premium_copy_count_check check (
    ordered_premium_copy_count between 0 and 10
  );

update public.book_projects
set ordered_premium_copy_count = greatest(ordered_premium_copy_count, 1)
where premium_hardcover_status = 'paid' or premium_hardcover_purchased_at is not null;

alter table public.commerce_orders
  add column if not exists standard_extra_copy_count integer not null default 0,
  add column if not exists premium_copy_count integer not null default 0,
  add column if not exists requested_standard_extra_copy_count integer not null default 0,
  add column if not exists requested_premium_copy_count integer not null default 0,
  add column if not exists gift_package_selected boolean not null default false,
  add column if not exists shipping_address jsonb not null default '{}'::jsonb;

alter table public.commerce_orders
  drop constraint if exists commerce_orders_standard_extra_copy_count_check,
  drop constraint if exists commerce_orders_premium_copy_count_check,
  drop constraint if exists commerce_orders_requested_standard_extra_copy_count_check,
  drop constraint if exists commerce_orders_requested_premium_copy_count_check;
alter table public.commerce_orders
  add constraint commerce_orders_standard_extra_copy_count_check check (standard_extra_copy_count between 0 and 10),
  add constraint commerce_orders_premium_copy_count_check check (premium_copy_count between 0 and 10),
  add constraint commerce_orders_requested_standard_extra_copy_count_check check (
    requested_standard_extra_copy_count = 0 or requested_standard_extra_copy_count between 2 and 10
  ),
  add constraint commerce_orders_requested_premium_copy_count_check check (
    requested_premium_copy_count between 0 and 10
  );

create or replace function public.standard_reprint_price(input_count integer)
returns integer language sql immutable as $$
  select case
    when coalesce(input_count, 0) = 0 then 0
    when input_count between 2 and 10 then 10000 + ((input_count - 2) * 4000)
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
  if requested_standard <> 0 and requested_standard not between 2 and 10 then
    raise exception 'スタンダード冊子の増刷は2冊から10冊で指定してください' using errcode = '22023';
  end if;
  if requested_premium not between 0 and 10 then
    raise exception 'プレミアム冊子は0冊から10冊で指定してください' using errcode = '22023';
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

  select coalesce(to_jsonb(s), '{}'::jsonb) into snapshot
  from public.book_cover_settings s where s.book_project_id = input_book_project_id;

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
  configured_guarantee_days integer := 40;
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

  select * into redemption_row from public.discount_redemptions where commerce_order_id = order_row.id for update;
  if redemption_row.id is not null and redemption_row.status = 'pending' then
    update public.discount_redemptions set status = 'redeemed', redeemed_at = now() where id = redemption_row.id;
    update public.discount_codes set redemption_count = redemption_count + 1, last_redeemed_at = now()
    where id = redemption_row.discount_code_id;
  end if;

  if order_row.order_type = 'self' and order_row.book_project_id is not null then
    perform set_config('app.payment_flow', 'on', true);
    update public.book_projects set
      access_status = case when order_row.includes_base_book then 'paid' else access_status end,
      purchased_at = case when order_row.includes_base_book then coalesce(purchased_at, order_row.purchased_at) else purchased_at end,
      purchaser_user_id = case when order_row.includes_base_book then order_row.purchaser_user_id else purchaser_user_id end,
      stripe_checkout_session_id = case when order_row.includes_base_book then input_checkout_session_id else stripe_checkout_session_id end,
      stripe_customer_id = case when order_row.includes_base_book then nullif(input_customer_id, '') else stripe_customer_id end,
      stripe_payment_intent_id = case when order_row.includes_base_book then nullif(input_payment_intent_id, '') else stripe_payment_intent_id end,
      commerce_order_id = case when order_row.includes_base_book then order_row.id else commerce_order_id end,
      ordered_standard_extra_copy_count = greatest(ordered_standard_extra_copy_count, order_row.requested_standard_extra_copy_count),
      ordered_premium_copy_count = greatest(ordered_premium_copy_count, order_row.requested_premium_copy_count),
      gift_package_purchased = gift_package_purchased or order_row.gift_package_selected,
      premium_hardcover_status = case when order_row.requested_premium_copy_count > 0 then 'paid' else premium_hardcover_status end,
      premium_hardcover_purchased_at = case
        when order_row.requested_premium_copy_count > 0 then coalesce(premium_hardcover_purchased_at, order_row.purchased_at)
        else premium_hardcover_purchased_at
      end,
      premium_hardcover_order_id = case
        when order_row.premium_copy_count > 0 then order_row.id else premium_hardcover_order_id
      end
    where id = order_row.book_project_id;
  else
    select coalesce(integer_value, 40) into configured_guarantee_days
    from public.commerce_settings where setting_key = 'gift_guarantee_days';
    select * into gift_row from public.gift_orders where commerce_order_id = order_row.id;
    if gift_row.id is not null and not gift_row.package_selected then
      update public.gift_orders set
        guarantee_starts_at = coalesce(guarantee_starts_at, order_row.purchased_at),
        guarantee_expires_at = coalesce(guarantee_expires_at, order_row.purchased_at + make_interval(days => configured_guarantee_days)),
        guarantee_status = case when guarantee_status = 'not_started' then 'eligible' else guarantee_status end
      where id = gift_row.id returning * into gift_row;
    end if;
  end if;

  return jsonb_build_object('order', to_jsonb(order_row), 'gift', case when gift_row.id is null then null else to_jsonb(gift_row) end);
end;
$$;

create or replace function public.get_admin_commerce_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select jsonb_build_object(
    'products', (select coalesce(jsonb_agg(to_jsonb(p) order by p.product_code), '[]'::jsonb) from public.commerce_products p),
    'campaigns', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) from public.discount_campaigns c),
    'codes', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) from public.discount_codes c),
    'orders', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
      select o.*,
        coalesce(nullif(btrim(concat_ws(' ', p.family_name, p.given_name)), ''), p.display_name, u.email) purchaser_name,
        u.email purchaser_email, dc.code discount_code, d.name campaign_name,
        concat_ws(' ＋ ',
          case when o.includes_base_book then '基本パッケージ（スタンダード冊子1冊）' end,
          case when o.standard_extra_copy_count > 0 then 'スタンダード冊子 増刷' || o.standard_extra_copy_count || '冊' end,
          case when o.premium_copy_count > 0 then 'プレミアム冊子 ' || o.premium_copy_count || '冊' end,
          case when o.gift_package_selected then 'ギフトパッケージ' end
        ) item_summary
      from public.commerce_orders o
      left join auth.users u on u.id = o.purchaser_user_id
      left join public.profiles p on p.id = o.purchaser_user_id
      left join public.discount_codes dc on dc.id = o.discount_code_id
      left join public.discount_campaigns d on d.id = dc.campaign_id
      order by o.created_at desc limit 500
    ) x),
    'gifts', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
      select g.*, o.order_number, o.purchaser_user_id, o.amount_total, o.status order_status
      from public.gift_orders g join public.commerce_orders o on o.id = g.commerce_order_id
      order by g.created_at desc limit 500
    ) x)
  ) into result;
  return result;
end;
$$;

revoke all on function public.standard_reprint_price(integer) from public;
grant execute on function public.standard_reprint_price(integer) to authenticated, service_role;
revoke all on function public.get_book_order_quote(uuid, text, integer, integer, boolean) from public;
grant execute on function public.get_book_order_quote(uuid, text, integer, integer, boolean) to authenticated, service_role;
revoke all on function public.create_book_commerce_order(uuid, uuid, text, integer, integer, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.create_book_commerce_order(uuid, uuid, text, integer, integer, boolean, jsonb) to service_role;

commit;
