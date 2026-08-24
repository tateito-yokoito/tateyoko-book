begin;

insert into public.commerce_products(
  product_code,
  display_name,
  description,
  amount_jpy,
  domestic_shipping_included
)
values (
  'premium_hardcover_v1',
  '高級製本版（追加1冊）',
  '厚みのある表紙と丁寧な仕立てによる、特別感のある高級製本版1冊を基本セットに追加',
  30000,
  true
)
on conflict (product_code) do update
set display_name = excluded.display_name,
    description = excluded.description,
    amount_jpy = excluded.amount_jpy,
    domestic_shipping_included = true,
    is_active = true,
    updated_at = now();

update public.commerce_products
set display_name = '縦糸横糸ブック 基本セット',
    description = '問いの配信、音声・文章・写真の編集、B5判ソフトカバー版1冊',
    domestic_shipping_included = true,
    updated_at = now()
where product_code = 'self_book_v1';

alter table public.book_cover_settings
  add column if not exists premium_hardcover_selected boolean not null default false;

alter table public.book_projects
  add column if not exists premium_hardcover_status text not null default 'not_selected',
  add column if not exists premium_hardcover_purchased_at timestamptz,
  add column if not exists premium_hardcover_order_id uuid references public.commerce_orders(id) on delete set null;

alter table public.book_projects
  drop constraint if exists book_projects_premium_hardcover_status_check;
alter table public.book_projects
  add constraint book_projects_premium_hardcover_status_check check (
    premium_hardcover_status in ('not_selected', 'selected', 'checkout_pending', 'paid', 'refunded')
  );

create index if not exists book_projects_premium_hardcover_order_idx
  on public.book_projects(premium_hardcover_order_id)
  where premium_hardcover_order_id is not null;

alter table public.commerce_orders
  add column if not exists includes_base_book boolean not null default true,
  add column if not exists includes_premium_hardcover boolean not null default false,
  add column if not exists base_book_amount integer not null default 0 check (base_book_amount >= 0),
  add column if not exists premium_hardcover_amount integer not null default 0 check (premium_hardcover_amount >= 0),
  add column if not exists design_snapshot jsonb not null default '{}'::jsonb;

update public.commerce_orders
set base_book_amount = amount_subtotal,
    includes_base_book = true
where base_book_amount = 0
  and premium_hardcover_amount = 0
  and product_code <> 'premium_hardcover_v1';

create or replace function public.get_book_order_quote(
  input_book_project_id uuid,
  input_discount_code text default null,
  input_include_premium_hardcover boolean default false
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
  code_row public.discount_codes%rowtype;
  campaign_row public.discount_campaigns%rowtype;
  normalized text := public.normalize_discount_code(input_discount_code);
  base_purchased boolean := false;
  premium_purchased boolean := false;
  include_premium boolean := false;
  base_amount integer := 0;
  premium_amount integer := 0;
  discount_amount integer := 0;
  campaign_used integer := 0;
begin
  select * into project_row from public.book_projects where id = input_book_project_id;
  if project_row.id is null then
    raise exception '物語が見つかりません' using errcode = 'P0002';
  end if;
  if auth.role() <> 'service_role' and not public.can_manage_book_cover(project_row.id) then
    raise exception 'この物語の注文情報を確認できません' using errcode = '42501';
  end if;

  select * into base_product from public.commerce_products
  where product_code = 'self_book_v1' and is_active = true;
  select * into premium_product from public.commerce_products
  where product_code = 'premium_hardcover_v1' and is_active = true;
  if base_product.product_code is null or premium_product.product_code is null then
    raise exception '商品が見つかりません' using errcode = 'P0002';
  end if;

  base_purchased := project_row.access_status in ('paid', 'gifted', 'legacy');
  premium_purchased := project_row.premium_hardcover_status = 'paid'
    or project_row.premium_hardcover_purchased_at is not null;
  include_premium := input_include_premium_hardcover or premium_purchased;
  base_amount := case when base_purchased then 0 else base_product.amount_jpy end;
  premium_amount := case when include_premium and not premium_purchased then premium_product.amount_jpy else 0 end;

  if normalized <> '' then
    if base_amount = 0 then
      raise exception '基本セットは購入済みのため、この注文に割引コードは利用できません' using errcode = '22023';
    end if;
    select c.* into code_row from public.discount_codes c
    where c.normalized_code = normalized and c.is_active = true;
    if code_row.id is null then raise exception '割引コードを確認できません' using errcode = '22023'; end if;
    select * into campaign_row from public.discount_campaigns where id = code_row.campaign_id;
    if campaign_row.status not in ('active', 'scheduled')
      or (campaign_row.starts_at is not null and campaign_row.starts_at > now())
      or (campaign_row.ends_at is not null and campaign_row.ends_at <= now())
      or (code_row.expires_at is not null and code_row.expires_at <= now()) then
      raise exception 'この割引コードは現在利用できません' using errcode = '22023';
    end if;
    if campaign_row.product_code <> 'self_book_v1' then
      raise exception 'この商品には利用できない割引コードです' using errcode = '22023';
    end if;
    if code_row.max_redemptions is not null and code_row.redemption_count >= code_row.max_redemptions then
      raise exception 'この割引コードは使用済みです' using errcode = '22023';
    end if;
    if campaign_row.max_redemptions is not null then
      select count(*) into campaign_used from public.discount_redemptions
      where campaign_id = campaign_row.id and status in ('pending', 'redeemed');
      if campaign_used >= campaign_row.max_redemptions then
        raise exception 'このキャンペーンは終了しました' using errcode = '22023';
      end if;
    end if;
    if campaign_row.one_per_account and auth.uid() is not null and exists (
      select 1 from public.discount_redemptions
      where campaign_id = campaign_row.id and purchaser_user_id = auth.uid() and status = 'redeemed'
    ) then
      raise exception 'この割引は1アカウントにつき1回利用できます' using errcode = '22023';
    end if;
    discount_amount := case campaign_row.discount_type
      when 'full' then base_amount
      when 'percent' then round(base_amount * campaign_row.discount_value / 100.0)::integer
      else least(base_amount, campaign_row.discount_value::integer)
    end;
  end if;

  return jsonb_build_object(
    'base_product_code', base_product.product_code,
    'base_product_name', base_product.display_name,
    'premium_product_code', premium_product.product_code,
    'premium_product_name', premium_product.display_name,
    'base_already_purchased', base_purchased,
    'premium_already_purchased', premium_purchased,
    'include_premium_hardcover', include_premium,
    'includes_base_book', not base_purchased,
    'base_book_amount', base_amount,
    'premium_hardcover_amount', premium_amount,
    'amount_subtotal', base_amount + premium_amount,
    'discount_amount', discount_amount,
    'amount_total', base_amount + premium_amount - discount_amount,
    'book_count', case when include_premium then 2 else 1 end,
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

revoke all on function public.get_book_order_quote(uuid, text, boolean) from public;
grant execute on function public.get_book_order_quote(uuid, text, boolean) to authenticated, service_role;

create or replace function public.create_book_commerce_order(
  input_purchaser_user_id uuid,
  input_book_project_id uuid,
  input_discount_code text,
  input_include_premium_hardcover boolean
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
  primary_product_code text;
  snapshot jsonb := '{}'::jsonb;
begin
  if input_purchaser_user_id is null then raise exception '購入者が必要です'; end if;
  if not exists (
    select 1 from public.book_projects
    where id = input_book_project_id and owner_user_id = input_purchaser_user_id
  ) then raise exception 'この物語の購入手続きを開始できません' using errcode = '42501'; end if;

  select coalesce(integer_value, 60) into reservation_minutes
  from public.commerce_settings where setting_key = 'checkout_reservation_minutes';
  update public.commerce_orders set status = 'expired'
  where status = 'checkout_pending' and created_at < now() - make_interval(mins => reservation_minutes);
  update public.discount_redemptions r set status = 'released'
  where status = 'pending' and exists (
    select 1 from public.commerce_orders o where o.id = r.commerce_order_id and o.status = 'expired'
  );

  quote := public.get_book_order_quote(input_book_project_id, input_discount_code, input_include_premium_hardcover);
  if not coalesce((quote ->> 'includes_base_book')::boolean, false)
    and coalesce((quote ->> 'premium_hardcover_amount')::integer, 0) = 0 then
    raise exception '追加のお支払いはありません' using errcode = '22023';
  end if;

  if quote ->> 'discount_code_id' is not null then
    select * into code_row from public.discount_codes
    where id = (quote ->> 'discount_code_id')::uuid for update;
    select * into campaign_row from public.discount_campaigns where id = code_row.campaign_id for update;
    select count(*) into used_count from public.discount_redemptions
    where discount_code_id = code_row.id and status in ('pending', 'redeemed');
    if code_row.max_redemptions is not null and used_count >= code_row.max_redemptions then
      raise exception 'この割引コードは使用中または使用済みです' using errcode = '22023';
    end if;
    if campaign_row.one_per_account and exists (
      select 1 from public.discount_redemptions
      where campaign_id = code_row.campaign_id
        and purchaser_user_id = input_purchaser_user_id
        and status in ('pending', 'redeemed')
    ) then
      raise exception 'この割引は1アカウントにつき1回利用できます' using errcode = '22023';
    end if;
  end if;

  select coalesce(to_jsonb(s), '{}'::jsonb) into snapshot
  from public.book_cover_settings s where s.book_project_id = input_book_project_id;
  primary_product_code := case
    when coalesce((quote ->> 'includes_base_book')::boolean, false) then 'self_book_v1'
    else 'premium_hardcover_v1'
  end;

  insert into public.commerce_orders(
    purchaser_user_id, book_project_id, order_type, product_code,
    amount_subtotal, gift_package_amount, discount_amount, amount_total,
    currency, discount_code_id, status,
    includes_base_book, includes_premium_hardcover,
    base_book_amount, premium_hardcover_amount, design_snapshot
  ) values (
    input_purchaser_user_id, input_book_project_id, 'self', primary_product_code,
    (quote ->> 'amount_subtotal')::integer, 0,
    (quote ->> 'discount_amount')::integer, (quote ->> 'amount_total')::integer,
    'jpy', nullif(quote ->> 'discount_code_id', '')::uuid, 'checkout_pending',
    coalesce((quote ->> 'includes_base_book')::boolean, false),
    coalesce((quote ->> 'include_premium_hardcover')::boolean, false)
      and coalesce((quote ->> 'premium_hardcover_amount')::integer, 0) > 0,
    (quote ->> 'base_book_amount')::integer,
    (quote ->> 'premium_hardcover_amount')::integer,
    snapshot
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

revoke all on function public.create_book_commerce_order(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.create_book_commerce_order(uuid, uuid, text, boolean) to service_role;

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
  guarantee_days integer := 40;
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
    select coalesce(integer_value, 40) into guarantee_days
    from public.commerce_settings where setting_key = 'gift_guarantee_days';
    select * into gift_row from public.gift_orders where commerce_order_id = order_row.id;
    if gift_row.id is not null and not gift_row.package_selected then
      update public.gift_orders set
        guarantee_starts_at = coalesce(guarantee_starts_at, order_row.purchased_at),
        guarantee_expires_at = coalesce(guarantee_expires_at, order_row.purchased_at + make_interval(days => guarantee_days)),
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

create or replace function public.expire_commerce_order(input_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare order_row public.commerce_orders%rowtype;
begin
  select * into order_row from public.commerce_orders where id = input_order_id;
  update public.commerce_orders set status = 'expired'
  where id = input_order_id and status = 'checkout_pending';
  update public.discount_redemptions set status = 'released'
  where commerce_order_id = input_order_id and status = 'pending';
  if order_row.includes_base_book then
    update public.book_projects set access_status = 'trial'
    where commerce_order_id = input_order_id and access_status = 'checkout_pending';
  end if;
  if order_row.includes_premium_hardcover then
    update public.book_projects set premium_hardcover_status = 'selected'
    where id = order_row.book_project_id and premium_hardcover_status = 'checkout_pending';
  end if;
end;
$$;

create or replace function public.record_commerce_refund(
  input_payment_intent_id text,
  input_refund_amount integer,
  input_is_full_refund boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare order_row public.commerce_orders%rowtype;
begin
  select * into order_row from public.commerce_orders
  where stripe_payment_intent_id = input_payment_intent_id for update;
  if order_row.id is null then return jsonb_build_object('found', false); end if;

  update public.commerce_orders set
    refund_amount = greatest(coalesce(refund_amount, 0), coalesce(input_refund_amount, 0)),
    status = case when input_is_full_refund then 'refunded' else status end,
    refunded_at = case when input_is_full_refund then coalesce(refunded_at, now()) else refunded_at end
  where id = order_row.id returning * into order_row;

  if input_is_full_refund then
    update public.discount_redemptions set status = 'refunded'
    where commerce_order_id = order_row.id and status = 'redeemed';
    update public.gift_orders set guarantee_status = 'refunded'
    where commerce_order_id = order_row.id;

    if order_row.order_type = 'self' and order_row.book_project_id is not null then
      perform set_config('app.payment_flow', 'on', true);
      if order_row.includes_base_book then
        update public.book_projects set access_status = 'refunded'
        where id = order_row.book_project_id;
      end if;
      if order_row.includes_premium_hardcover then
        update public.book_projects set premium_hardcover_status = 'refunded'
        where id = order_row.book_project_id
          and premium_hardcover_order_id = order_row.id;
      end if;
    end if;
  end if;
  return jsonb_build_object('found', true, 'order', to_jsonb(order_row));
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
          case when o.includes_base_book then 'ソフトカバー版 1冊' end,
          case when o.includes_premium_hardcover then '高級製本版 1冊' end,
          case when o.gift_package_amount > 0 then 'ギフトパッケージ' end
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

revoke all on function public.get_book_order_quote(uuid, text, boolean),
  public.create_book_commerce_order(uuid, uuid, text, boolean) from public;
grant execute on function public.get_book_order_quote(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.create_book_commerce_order(uuid, uuid, text, boolean) to service_role;
revoke all on function public.record_commerce_refund(text, integer, boolean) from public, anon, authenticated;
grant execute on function public.record_commerce_refund(text, integer, boolean) to service_role;

commit;
