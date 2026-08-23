begin;

-- Commercial data is intentionally separate from book_projects.  A gift can
-- be paid for before the recipient has an account or a project, and a project
-- must not lose its accounting history when ownership changes later.

create table if not exists public.commerce_products (
  product_code text primary key,
  display_name text not null,
  description text,
  amount_jpy integer not null check (amount_jpy >= 0),
  currency text not null default 'jpy' check (currency = 'jpy'),
  tax_included boolean not null default true,
  domestic_shipping_included boolean not null default false,
  is_active boolean not null default true,
  stripe_product_id text,
  stripe_price_id text,
  stripe_mode text check (stripe_mode in ('test', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.commerce_products(
  product_code,
  display_name,
  description,
  amount_jpy,
  domestic_shipping_included
)
values
  (
    'self_book_v1',
    '縦糸横糸ブック',
    '問いの配信、音声・文章・写真の編集、B5判布張り本1冊',
    49800,
    true
  ),
  (
    'gift_package_v1',
    'ギフトパッケージ',
    'コンセプトブック、使い方案内、メッセージカード、贈答用パッケージ',
    3000,
    true
  )
on conflict (product_code) do update
set domestic_shipping_included = excluded.domestic_shipping_included,
    updated_at = now();

create table if not exists public.commerce_settings (
  setting_key text primary key,
  integer_value integer,
  text_value text,
  updated_at timestamptz not null default now()
);

insert into public.commerce_settings(setting_key, integer_value)
values
  ('gift_guarantee_days', 40),
  ('checkout_reservation_minutes', 60),
  ('sales_mode_minutes', 15)
on conflict (setting_key) do nothing;

create table if not exists public.discount_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campaign_type text not null check (campaign_type in ('crowdfunding', 'advertising', 'agency')),
  product_code text not null references public.commerce_products(product_code),
  discount_type text not null check (discount_type in ('amount', 'percent', 'full')),
  discount_value numeric(10, 2) not null check (discount_value >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  one_per_account boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'paused', 'ended')),
  partner_name text,
  partner_reference text,
  stripe_coupon_id text,
  stripe_mode text check (stripe_mode in ('test', 'live')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discount_campaign_dates_check check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint discount_campaign_value_check check (
    (discount_type = 'percent' and discount_value > 0 and discount_value <= 100)
    or (discount_type = 'amount' and discount_value > 0)
    or (discount_type = 'full' and discount_value = 100)
  )
);

create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.discount_campaigns(id) on delete cascade,
  code text not null,
  normalized_code text not null unique,
  assigned_reference text,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  last_redeemed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.commerce_order_number_seq start 1001;

create table if not exists public.commerce_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('TY-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.commerce_order_number_seq')::text, 6, '0')),
  purchaser_user_id uuid not null references auth.users(id) on delete restrict,
  book_project_id uuid references public.book_projects(id) on delete set null,
  order_type text not null check (order_type in ('self', 'gift')),
  product_code text not null references public.commerce_products(product_code),
  amount_subtotal integer not null check (amount_subtotal >= 0),
  gift_package_amount integer not null default 0 check (gift_package_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  amount_total integer not null check (amount_total >= 0),
  currency text not null default 'jpy' check (currency = 'jpy'),
  discount_code_id uuid references public.discount_codes(id) on delete set null,
  status text not null default 'draft' check (
    status in ('draft', 'checkout_pending', 'paid', 'zero_paid', 'refund_pending', 'refunded', 'cancelled', 'expired')
  ),
  stripe_checkout_session_id text unique,
  stripe_customer_id text,
  stripe_payment_intent_id text,
  stripe_mode text check (stripe_mode in ('test', 'live')),
  purchased_at timestamptz,
  refunded_at timestamptz,
  refund_amount integer check (refund_amount is null or refund_amount >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_order_discount_check check (discount_amount <= amount_subtotal),
  constraint commerce_order_total_check check (amount_total = amount_subtotal - discount_amount + gift_package_amount)
);

create table if not exists public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_code_id uuid not null references public.discount_codes(id) on delete restrict,
  campaign_id uuid not null references public.discount_campaigns(id) on delete restrict,
  commerce_order_id uuid not null unique references public.commerce_orders(id) on delete cascade,
  purchaser_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'redeemed', 'released', 'refunded')),
  amount_discounted integer not null default 0,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gift_orders (
  id uuid primary key default gen_random_uuid(),
  commerce_order_id uuid not null unique references public.commerce_orders(id) on delete cascade,
  recipient_name text not null,
  recipient_email text,
  gift_message text,
  package_selected boolean not null default true,
  package_status text not null default 'pending' check (
    package_status in ('not_requested', 'pending', 'preparing', 'shipped', 'delivered', 'cancelled')
  ),
  shipping_address jsonb not null default '{}'::jsonb,
  tracking_number text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  guarantee_days integer not null default 40 check (guarantee_days > 0 and guarantee_days <= 365),
  guarantee_starts_at timestamptz,
  guarantee_expires_at timestamptz,
  guarantee_status text not null default 'not_started' check (
    guarantee_status in ('not_started', 'eligible', 'continued', 'expired', 'refund_requested', 'refunded')
  ),
  claim_token text not null unique,
  claim_code text not null unique,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  recipient_project_id uuid references public.book_projects(id) on delete set null,
  first_answer_at timestamptz,
  fourth_answer_at timestamptz,
  continuation_status text not null default 'pending' check (continuation_status in ('pending', 'continue', 'stop')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_event_receipts (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  object_id text,
  processed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

alter table public.book_projects
  add column if not exists commerce_order_id uuid references public.commerce_orders(id) on delete set null;

create unique index if not exists book_projects_commerce_order_unique
  on public.book_projects(commerce_order_id)
  where commerce_order_id is not null;

create index if not exists commerce_orders_purchaser_idx on public.commerce_orders(purchaser_user_id, created_at desc);
create index if not exists commerce_orders_project_idx on public.commerce_orders(book_project_id);
create index if not exists commerce_orders_status_idx on public.commerce_orders(status, created_at desc);
create index if not exists discount_codes_campaign_idx on public.discount_codes(campaign_id, is_active);
create index if not exists discount_redemptions_code_idx on public.discount_redemptions(discount_code_id, status);
create index if not exists gift_orders_status_idx on public.gift_orders(package_status, guarantee_status, created_at desc);

drop trigger if exists commerce_products_updated_at on public.commerce_products;
create trigger commerce_products_updated_at before update on public.commerce_products
for each row execute function public.set_updated_at();
drop trigger if exists discount_campaigns_updated_at on public.discount_campaigns;
create trigger discount_campaigns_updated_at before update on public.discount_campaigns
for each row execute function public.set_updated_at();
drop trigger if exists discount_codes_updated_at on public.discount_codes;
create trigger discount_codes_updated_at before update on public.discount_codes
for each row execute function public.set_updated_at();
drop trigger if exists commerce_orders_updated_at on public.commerce_orders;
create trigger commerce_orders_updated_at before update on public.commerce_orders
for each row execute function public.set_updated_at();
drop trigger if exists discount_redemptions_updated_at on public.discount_redemptions;
create trigger discount_redemptions_updated_at before update on public.discount_redemptions
for each row execute function public.set_updated_at();
drop trigger if exists gift_orders_updated_at on public.gift_orders;
create trigger gift_orders_updated_at before update on public.gift_orders
for each row execute function public.set_updated_at();

alter table public.commerce_products enable row level security;
alter table public.commerce_settings enable row level security;
alter table public.discount_campaigns enable row level security;
alter table public.discount_codes enable row level security;
alter table public.commerce_orders enable row level security;
alter table public.discount_redemptions enable row level security;
alter table public.gift_orders enable row level security;
alter table public.stripe_event_receipts enable row level security;

revoke all on table public.commerce_products, public.commerce_settings, public.discount_campaigns,
  public.discount_codes, public.commerce_orders, public.discount_redemptions, public.gift_orders,
  public.stripe_event_receipts from public, anon, authenticated;
grant all on table public.commerce_products, public.commerce_settings, public.discount_campaigns,
  public.discount_codes, public.commerce_orders, public.discount_redemptions, public.gift_orders,
  public.stripe_event_receipts to service_role;
grant usage, select on sequence public.commerce_order_number_seq to service_role;

create policy commerce_orders_purchaser_select on public.commerce_orders
for select to authenticated using (purchaser_user_id = auth.uid());
create policy gift_orders_purchaser_select on public.gift_orders
for select to authenticated using (
  exists (
    select 1 from public.commerce_orders o
    where o.id = gift_orders.commerce_order_id and o.purchaser_user_id = auth.uid()
  )
);
grant select on public.commerce_orders, public.gift_orders to authenticated;

create or replace function public.normalize_discount_code(input_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(input_code, ''), '[^a-zA-Z0-9]', '', 'g'));
$$;

create or replace function public.get_commerce_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_code', product_code,
    'display_name', display_name,
    'description', description,
    'amount_jpy', amount_jpy,
    'currency', currency,
    'tax_included', tax_included,
    'domestic_shipping_included', domestic_shipping_included
  ) order by product_code), '[]'::jsonb)
  from public.commerce_products
  where is_active = true;
$$;

create or replace function public.get_commerce_quote(
  input_product_code text default 'self_book_v1',
  input_discount_code text default null,
  input_include_gift_package boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  product_row public.commerce_products%rowtype;
  package_row public.commerce_products%rowtype;
  code_row public.discount_codes%rowtype;
  campaign_row public.discount_campaigns%rowtype;
  normalized text := public.normalize_discount_code(input_discount_code);
  discount_amount integer := 0;
  campaign_used integer := 0;
begin
  select * into product_row from public.commerce_products
  where product_code = input_product_code and is_active = true;
  if product_row.product_code is null then
    raise exception '商品が見つかりません' using errcode = 'P0002';
  end if;

  if input_include_gift_package then
    select * into package_row from public.commerce_products
    where product_code = 'gift_package_v1' and is_active = true;
  end if;

  if normalized <> '' then
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
    if campaign_row.product_code <> product_row.product_code then
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
      when 'full' then product_row.amount_jpy
      when 'percent' then round(product_row.amount_jpy * campaign_row.discount_value / 100.0)::integer
      else least(product_row.amount_jpy, campaign_row.discount_value::integer)
    end;
  end if;

  return jsonb_build_object(
    'product_code', product_row.product_code,
    'product_name', product_row.display_name,
    'amount_subtotal', product_row.amount_jpy,
    'gift_package_amount', case when input_include_gift_package then coalesce(package_row.amount_jpy, 0) else 0 end,
    'discount_amount', discount_amount,
    'amount_total', product_row.amount_jpy - discount_amount + case when input_include_gift_package then coalesce(package_row.amount_jpy, 0) else 0 end,
    'currency', product_row.currency,
    'tax_included', product_row.tax_included,
    'domestic_shipping_included', product_row.domestic_shipping_included,
    'discount_code_id', code_row.id,
    'discount_code', code_row.code,
    'campaign_id', campaign_row.id,
    'campaign_name', campaign_row.name,
    'campaign_type', campaign_row.campaign_type
  );
end;
$$;

revoke all on function public.get_commerce_catalog() from public;
grant execute on function public.get_commerce_catalog() to anon, authenticated;
revoke all on function public.get_commerce_quote(text, text, boolean) from public;
grant execute on function public.get_commerce_quote(text, text, boolean) to authenticated;

create or replace function public.create_commerce_order(
  input_purchaser_user_id uuid,
  input_book_project_id uuid,
  input_order_type text,
  input_product_code text,
  input_discount_code text,
  input_include_gift_package boolean,
  input_gift jsonb default '{}'::jsonb
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
  guarantee_days integer := 40;
  reservation_minutes integer := 60;
  claim_token text;
  claim_code text;
  used_count integer;
begin
  if input_order_type not in ('self', 'gift') then raise exception '注文種別が不正です'; end if;
  if input_purchaser_user_id is null then raise exception '購入者が必要です'; end if;

  select coalesce(integer_value, 40) into guarantee_days from public.commerce_settings where setting_key = 'gift_guarantee_days';
  select coalesce(integer_value, 60) into reservation_minutes from public.commerce_settings where setting_key = 'checkout_reservation_minutes';

  update public.commerce_orders set status = 'expired'
  where status = 'checkout_pending' and created_at < now() - make_interval(mins => reservation_minutes);
  update public.discount_redemptions r set status = 'released'
  where status = 'pending' and exists (
    select 1 from public.commerce_orders o where o.id = r.commerce_order_id and o.status = 'expired'
  );

  quote := public.get_commerce_quote(input_product_code, input_discount_code, input_include_gift_package);
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
      where campaign_id = campaign_row.id and purchaser_user_id = input_purchaser_user_id and status in ('pending', 'redeemed')
    ) then
      raise exception 'この割引は1アカウントにつき1回利用できます' using errcode = '22023';
    end if;
  end if;

  insert into public.commerce_orders(
    purchaser_user_id, book_project_id, order_type, product_code,
    amount_subtotal, gift_package_amount, discount_amount, amount_total,
    currency, discount_code_id, status
  ) values (
    input_purchaser_user_id,
    case when input_order_type = 'self' then input_book_project_id else null end,
    input_order_type,
    input_product_code,
    (quote ->> 'amount_subtotal')::integer,
    (quote ->> 'gift_package_amount')::integer,
    (quote ->> 'discount_amount')::integer,
    (quote ->> 'amount_total')::integer,
    quote ->> 'currency',
    nullif(quote ->> 'discount_code_id', '')::uuid,
    'checkout_pending'
  ) returning * into order_row;

  if code_row.id is not null then
    insert into public.discount_redemptions(
      discount_code_id, campaign_id, commerce_order_id, purchaser_user_id, amount_discounted
    ) values (
      code_row.id, code_row.campaign_id, order_row.id, input_purchaser_user_id,
      (quote ->> 'discount_amount')::integer
    );
  end if;

  if input_order_type = 'gift' then
    claim_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    claim_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    insert into public.gift_orders(
      commerce_order_id, recipient_name, recipient_email, gift_message,
      package_selected, package_status, shipping_address, guarantee_days,
      claim_token, claim_code
    ) values (
      order_row.id,
      nullif(btrim(input_gift ->> 'recipient_name'), ''),
      nullif(lower(btrim(input_gift ->> 'recipient_email')), ''),
      nullif(btrim(input_gift ->> 'gift_message'), ''),
      input_include_gift_package,
      case when input_include_gift_package then 'pending' else 'not_requested' end,
      coalesce(input_gift -> 'shipping_address', '{}'::jsonb),
      guarantee_days,
      claim_token,
      claim_code
    );
  end if;

  return jsonb_build_object('order', to_jsonb(order_row), 'quote', quote);
end;
$$;

revoke all on function public.create_commerce_order(uuid, uuid, text, text, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.create_commerce_order(uuid, uuid, text, text, text, boolean, jsonb) to service_role;

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
begin
  select * into order_row from public.commerce_orders where id = input_order_id for update;
  if order_row.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if input_payment_status not in ('paid', 'no_payment_required') then raise exception 'Payment is not complete'; end if;
  if input_amount_total is distinct from order_row.amount_total then
    raise exception 'Payment total does not match order';
  end if;
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
    update public.discount_redemptions set status = 'redeemed', redeemed_at = now()
    where id = redemption_row.id;
    update public.discount_codes set
      redemption_count = redemption_count + 1,
      last_redeemed_at = now()
    where id = redemption_row.discount_code_id;
  end if;

  if order_row.order_type = 'self' and order_row.book_project_id is not null then
    perform set_config('app.payment_flow', 'on', true);
    update public.book_projects set
      access_status = 'paid',
      purchased_at = coalesce(purchased_at, order_row.purchased_at),
      purchaser_user_id = order_row.purchaser_user_id,
      stripe_checkout_session_id = input_checkout_session_id,
      stripe_customer_id = nullif(input_customer_id, ''),
      stripe_payment_intent_id = nullif(input_payment_intent_id, ''),
      commerce_order_id = order_row.id
    where id = order_row.book_project_id;
  else
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
begin
  update public.commerce_orders set status = 'expired'
  where id = input_order_id and status = 'checkout_pending';
  update public.discount_redemptions set status = 'released'
  where commerce_order_id = input_order_id and status = 'pending';
  update public.book_projects set access_status = 'trial'
  where commerce_order_id = input_order_id and access_status = 'checkout_pending';
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
    update public.book_projects set access_status = 'refunded'
    where commerce_order_id = order_row.id;
  end if;
  return jsonb_build_object('found', true, 'order', to_jsonb(order_row));
end;
$$;

revoke all on function public.finalize_commerce_order(uuid, text, text, text, text, integer, text, timestamptz),
  public.expire_commerce_order(uuid), public.record_commerce_refund(text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.finalize_commerce_order(uuid, text, text, text, text, integer, text, timestamptz),
  public.expire_commerce_order(uuid), public.record_commerce_refund(text, integer, boolean)
  to service_role;

create or replace function public.get_gift_claim_preview(input_claim_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'valid', o.status in ('paid', 'zero_paid') and g.claimed_at is null,
    'recipient_name', g.recipient_name,
    'gift_message', g.gift_message,
    'purchaser_name', coalesce(
      nullif(btrim(concat_ws(' ', p.family_name, p.given_name)), ''),
      nullif(p.display_name, ''),
      'ご家族'
    ),
    'package_status', g.package_status,
    'claimed', g.claimed_at is not null
  ) into result
  from public.gift_orders g
  join public.commerce_orders o on o.id = g.commerce_order_id
  left join public.profiles p on p.id = o.purchaser_user_id
  where g.claim_token = input_claim_token;
  return coalesce(result, jsonb_build_object('valid', false));
end;
$$;

create or replace function public.claim_gift_order(input_claim_token text, input_book_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare gift_row public.gift_orders%rowtype;
declare order_row public.commerce_orders%rowtype;
begin
  if auth.uid() is null then raise exception 'ログインが必要です' using errcode = '42501'; end if;
  select * into gift_row from public.gift_orders where claim_token = input_claim_token for update;
  if gift_row.id is null then raise exception 'ギフトが見つかりません' using errcode = 'P0002'; end if;
  select * into order_row from public.commerce_orders where id = gift_row.commerce_order_id;
  if order_row.status not in ('paid', 'zero_paid') then raise exception 'このギフトはまだ利用できません'; end if;
  if gift_row.claimed_by_user_id is not null and gift_row.claimed_by_user_id <> auth.uid() then
    raise exception 'このギフトは受取済みです' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.book_projects where id = input_book_project_id and owner_user_id = auth.uid()
  ) then raise exception '物語を確認できません' using errcode = '42501'; end if;

  perform set_config('app.payment_flow', 'on', true);
  update public.book_projects set
    access_status = 'gifted',
    purchaser_user_id = order_row.purchaser_user_id,
    purchased_at = order_row.purchased_at,
    commerce_order_id = order_row.id
  where id = input_book_project_id and owner_user_id = auth.uid();

  update public.commerce_orders set book_project_id = input_book_project_id where id = order_row.id;
  update public.gift_orders set
    claimed_by_user_id = auth.uid(),
    claimed_at = coalesce(claimed_at, now()),
    recipient_project_id = input_book_project_id
  where id = gift_row.id;

  return jsonb_build_object('success', true, 'project_id', input_book_project_id, 'order_id', order_row.id);
end;
$$;

-- Preserve the client-side purchaser protection while allowing the two
-- SECURITY DEFINER payment transitions above to set the historical payer.
create or replace function public.set_book_project_purchaser()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if auth.role() = 'authenticated'
    and coalesce(current_setting('app.payment_flow', true), '') <> 'on' then
    if tg_op = 'INSERT' and new.purchaser_user_id is not null then
      raise exception 'Purchaser is managed by the payment flow' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.purchaser_user_id is distinct from old.purchaser_user_id then
      raise exception 'Purchaser is managed by the payment flow' using errcode = '42501';
    end if;
  end if;

  if new.purchaser_user_id is null
    and (
      new.purchased_at is not null
      or new.stripe_checkout_session_id is not null
      or new.stripe_payment_intent_id is not null
    ) then
    new.purchaser_user_id := new.owner_user_id;
  end if;

  return new;
end;
$$;

revoke all on function public.get_gift_claim_preview(text) from public;
grant execute on function public.get_gift_claim_preview(text) to anon, authenticated;
revoke all on function public.claim_gift_order(text, uuid) from public;
grant execute on function public.claim_gift_order(text, uuid) to authenticated;

create or replace function public.track_gift_answer_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.gift_orders set
    first_answer_at = case when new.sequence_order <= 3 then coalesce(first_answer_at, now()) else first_answer_at end,
    fourth_answer_at = case when new.sequence_order >= 4 then coalesce(fourth_answer_at, now()) else fourth_answer_at end,
    continuation_status = case when new.sequence_order >= 4 then 'continue' else continuation_status end,
    guarantee_status = case when new.sequence_order >= 4 then 'continued' else guarantee_status end
  where recipient_project_id = new.book_project_id;
  return new;
end;
$$;

drop trigger if exists track_gift_answer_progress on public.answers;
create trigger track_gift_answer_progress
after insert or update of transcript_raw, transcript_edited on public.answers
for each row execute function public.track_gift_answer_progress();

create table if not exists public.admin_sales_mode_sessions (
  admin_user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > started_at)
);
alter table public.admin_sales_mode_sessions enable row level security;
revoke all on table public.admin_sales_mode_sessions from public, anon, authenticated;
grant all on table public.admin_sales_mode_sessions to service_role;

create or replace function public.is_admin_sales_mode_active()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.admin_sales_mode_sessions s
    join public.admin_users a on a.user_id = s.admin_user_id
    where s.admin_user_id = auth.uid() and s.expires_at > now() and a.is_active and a.role = 'owner'
  );
$$;

create or replace function public.get_admin_sales_mode_status()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare expiry timestamptz; declare minutes integer := 15; declare role_value text;
begin
  select role into role_value from public.admin_users where user_id = auth.uid() and is_active;
  if role_value is null then raise exception 'Admin access required' using errcode = '42501'; end if;
  select coalesce(integer_value, 15) into minutes from public.commerce_settings where setting_key = 'sales_mode_minutes';
  select expires_at into expiry from public.admin_sales_mode_sessions where admin_user_id = auth.uid() and expires_at > now();
  return jsonb_build_object('active', expiry is not null and role_value = 'owner', 'expires_at', expiry, 'duration_minutes', minutes, 'can_start', role_value = 'owner');
end;
$$;

create or replace function public.start_admin_sales_mode()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare minutes integer := 15; declare expiry timestamptz; declare last_auth timestamptz;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid() and is_active and role = 'owner') then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  select last_sign_in_at into last_auth from auth.users where id = auth.uid();
  if last_auth is null or last_auth < now() - interval '5 minutes' then raise exception 'Recent reauthentication required' using errcode = '42501'; end if;
  select coalesce(integer_value, 15) into minutes from public.commerce_settings where setting_key = 'sales_mode_minutes';
  expiry := now() + make_interval(mins => minutes);
  insert into public.admin_sales_mode_sessions(admin_user_id, started_at, expires_at)
  values (auth.uid(), now(), expiry) on conflict (admin_user_id) do update set started_at = now(), expires_at = excluded.expires_at;
  insert into public.admin_audit_logs(admin_user_id, action, entity_type, metadata)
  values (auth.uid(), 'start_sales_mode', 'admin_session', jsonb_build_object('expires_at', expiry));
  return jsonb_build_object('active', true, 'expires_at', expiry, 'duration_minutes', minutes);
end;
$$;

create or replace function public.end_admin_sales_mode()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
begin
  delete from public.admin_sales_mode_sessions where admin_user_id = auth.uid();
  return jsonb_build_object('active', false);
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
      select o.*, coalesce(nullif(btrim(concat_ws(' ', p.family_name, p.given_name)), ''), p.display_name, u.email) purchaser_name,
        u.email purchaser_email, dc.code discount_code, d.name campaign_name
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

create or replace function public.admin_save_discount_campaign(input_campaign jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare campaign_row public.discount_campaigns%rowtype;
begin
  if not public.is_admin_sales_mode_active() then raise exception '販売管理モードが必要です' using errcode = '42501'; end if;
  if nullif(input_campaign ->> 'id', '') is null then
    insert into public.discount_campaigns(
      name, campaign_type, product_code, discount_type, discount_value,
      starts_at, ends_at, max_redemptions, one_per_account, status,
      partner_name, partner_reference, created_by
    ) values (
      btrim(input_campaign ->> 'name'), input_campaign ->> 'campaign_type', coalesce(input_campaign ->> 'product_code', 'self_book_v1'),
      input_campaign ->> 'discount_type', (input_campaign ->> 'discount_value')::numeric,
      nullif(input_campaign ->> 'starts_at', '')::timestamptz, nullif(input_campaign ->> 'ends_at', '')::timestamptz,
      nullif(input_campaign ->> 'max_redemptions', '')::integer, coalesce((input_campaign ->> 'one_per_account')::boolean, false),
      coalesce(input_campaign ->> 'status', 'draft'), nullif(input_campaign ->> 'partner_name', ''),
      nullif(input_campaign ->> 'partner_reference', ''), auth.uid()
    ) returning * into campaign_row;
  else
    update public.discount_campaigns set
      name = btrim(input_campaign ->> 'name'), campaign_type = input_campaign ->> 'campaign_type',
      discount_type = input_campaign ->> 'discount_type', discount_value = (input_campaign ->> 'discount_value')::numeric,
      starts_at = nullif(input_campaign ->> 'starts_at', '')::timestamptz,
      ends_at = nullif(input_campaign ->> 'ends_at', '')::timestamptz,
      max_redemptions = nullif(input_campaign ->> 'max_redemptions', '')::integer,
      one_per_account = coalesce((input_campaign ->> 'one_per_account')::boolean, false),
      status = coalesce(input_campaign ->> 'status', status), partner_name = nullif(input_campaign ->> 'partner_name', ''),
      partner_reference = nullif(input_campaign ->> 'partner_reference', ''), stripe_coupon_id = null, stripe_mode = null
    where id = (input_campaign ->> 'id')::uuid returning * into campaign_row;
  end if;
  return to_jsonb(campaign_row);
end;
$$;

create or replace function public.admin_generate_discount_codes(
  input_campaign_id uuid,
  input_quantity integer default 1,
  input_prefix text default '',
  input_common_code text default null,
  input_max_redemptions integer default 1,
  input_expires_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare generated jsonb := '[]'::jsonb; declare code_value text; declare code_row public.discount_codes%rowtype; declare i integer;
begin
  if not public.is_admin_sales_mode_active() then raise exception '販売管理モードが必要です' using errcode = '42501'; end if;
  if input_quantity < 1 or input_quantity > 1000 then raise exception '発行数は1〜1000件です'; end if;
  for i in 1..input_quantity loop
    code_value := case when input_common_code is not null then public.normalize_discount_code(input_common_code)
      else public.normalize_discount_code(input_prefix) || upper(substr(md5(random()::text || clock_timestamp()::text || i::text), 1, 12)) end;
    insert into public.discount_codes(campaign_id, code, normalized_code, max_redemptions, expires_at)
    values (input_campaign_id, code_value, code_value, input_max_redemptions, input_expires_at)
    returning * into code_row;
    generated := generated || jsonb_build_array(to_jsonb(code_row));
  end loop;
  return generated;
end;
$$;

create or replace function public.admin_set_discount_code_active(input_code_id uuid, input_active boolean)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare code_row public.discount_codes%rowtype;
begin
  if not public.is_admin_sales_mode_active() then raise exception '販売管理モードが必要です' using errcode = '42501'; end if;
  update public.discount_codes set is_active = input_active where id = input_code_id returning * into code_row;
  return to_jsonb(code_row);
end;
$$;

create or replace function public.admin_set_product_price(input_product_code text, input_amount_jpy integer)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare product_row public.commerce_products%rowtype;
begin
  if not public.is_admin_sales_mode_active() then raise exception '販売管理モードが必要です' using errcode = '42501'; end if;
  if input_amount_jpy < 0 then raise exception '価格が不正です'; end if;
  -- Keep the Stripe Product stable so product-scoped coupons stay valid; only a new Price is required.
  update public.commerce_products set amount_jpy = input_amount_jpy, stripe_price_id = null
  where product_code = input_product_code returning * into product_row;
  insert into public.admin_audit_logs(admin_user_id, action, entity_type, metadata)
  values (auth.uid(), 'change_product_price', 'commerce_product', jsonb_build_object('product_code', input_product_code, 'amount_jpy', input_amount_jpy));
  return to_jsonb(product_row);
end;
$$;

create or replace function public.admin_update_gift_fulfillment(
  input_gift_order_id uuid,
  input_package_status text,
  input_tracking_number text default null,
  input_delivered_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare gift_row public.gift_orders%rowtype;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  update public.gift_orders set
    package_status = input_package_status,
    tracking_number = coalesce(nullif(input_tracking_number, ''), tracking_number),
    shipped_at = case when input_package_status = 'shipped' then coalesce(shipped_at, now()) else shipped_at end,
    delivered_at = case when input_package_status = 'delivered' then coalesce(input_delivered_at, delivered_at, now()) else delivered_at end,
    guarantee_starts_at = case when input_package_status = 'delivered' then coalesce(guarantee_starts_at, input_delivered_at, delivered_at, now()) else guarantee_starts_at end,
    guarantee_expires_at = case when input_package_status = 'delivered' then coalesce(guarantee_expires_at, coalesce(input_delivered_at, delivered_at, now()) + make_interval(days => guarantee_days)) else guarantee_expires_at end,
    guarantee_status = case when input_package_status = 'delivered' and guarantee_status = 'not_started' then 'eligible' else guarantee_status end
  where id = input_gift_order_id returning * into gift_row;
  return to_jsonb(gift_row);
end;
$$;

revoke all on function public.get_admin_sales_mode_status(), public.start_admin_sales_mode(), public.end_admin_sales_mode(),
  public.get_admin_commerce_dashboard(), public.admin_save_discount_campaign(jsonb),
  public.admin_generate_discount_codes(uuid, integer, text, text, integer, timestamptz),
  public.admin_set_discount_code_active(uuid, boolean), public.admin_set_product_price(text, integer),
  public.admin_update_gift_fulfillment(uuid, text, text, timestamptz) from public;
grant execute on function public.get_admin_sales_mode_status(), public.start_admin_sales_mode(), public.end_admin_sales_mode(),
  public.get_admin_commerce_dashboard(), public.admin_save_discount_campaign(jsonb),
  public.admin_generate_discount_codes(uuid, integer, text, text, integer, timestamptz),
  public.admin_set_discount_code_active(uuid, boolean), public.admin_set_product_price(text, integer),
  public.admin_update_gift_fulfillment(uuid, text, text, timestamptz) to authenticated;

comment on table public.commerce_orders is 'Stripe決済と0円注文を含む、変更されない購入台帳。';
comment on table public.gift_orders is '受取人登録前から保持するギフト注文、パッケージ配送、40日保証の状態。';
comment on table public.discount_codes is 'クラファン個別・広告共通・代理店共通の割引コード。';

commit;
