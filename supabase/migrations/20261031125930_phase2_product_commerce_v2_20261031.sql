-- Additive Phase 2 contract. Legacy product and order rows remain readable.
begin;

insert into public.commerce_products
  (product_code, display_name, description, amount_jpy, currency, tax_included, domestic_shipping_included, is_active)
values
  ('standard_bundle_v2', '縦糸横糸ブック スタンダード', 'B5ソフトカバーとWebブック', 35000, 'jpy', true, true, true),
  ('premium_bundle_v2', '縦糸横糸ブック プレミアム', '布貼り上製本とWebブック', 65000, 'jpy', true, true, true),
  ('standard_extra_v2', 'スタンダード追加冊子', '追加ソフトカバー1冊', 5000, 'jpy', true, true, true),
  ('premium_extra_v2', 'プレミアム追加冊子', '追加上製本1冊', 35000, 'jpy', true, true, true),
  ('interview_support_v1', '聞き取り制作サポート', '事前相談後の聞き取り・文章化・作品制作', 20000, 'jpy', true, true, true)
on conflict (product_code) do nothing;

do $$
begin
  if exists (
    select 1 from (values
      ('standard_bundle_v2', 35000), ('premium_bundle_v2', 65000),
      ('standard_extra_v2', 5000), ('premium_extra_v2', 35000),
      ('interview_support_v1', 20000)
    ) as expected(product_code, amount_jpy)
    left join public.commerce_products actual using (product_code)
    where actual.product_code is null or actual.amount_jpy <> expected.amount_jpy
      or actual.currency <> 'jpy' or actual.tax_included is not true
  ) then
    raise exception 'Phase 2 product catalog differs from the approved price contract';
  end if;
end;
$$;

alter table public.commerce_orders
  add column if not exists edition_v2 text,
  add column if not exists production_method_v2 text,
  add column if not exists pricing_version text,
  add column if not exists consultation_id_v2 uuid,
  add column if not exists request_key_v2 uuid,
  add column if not exists quote_snapshot_v2 jsonb;

alter table public.commerce_orders
  add constraint commerce_orders_edition_v2_check
    check (edition_v2 is null or edition_v2 in ('standard', 'premium')),
  add constraint commerce_orders_production_method_v2_check
    check (production_method_v2 is null or production_method_v2 in ('self_or_family', 'interview_staff')),
  add constraint commerce_orders_v2_pair_check
    check ((edition_v2 is null and production_method_v2 is null and pricing_version is null)
      or (edition_v2 is not null and production_method_v2 is not null and pricing_version = 'v2'));

create table public.commerce_v2_consultations (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid references auth.users(id) on delete set null,
  family_invitation_id uuid references public.family_story_invitations(id) on delete restrict,
  order_type text not null default 'self' check (order_type in ('self', 'gift')),
  product_preference text not null check (product_preference in ('standard', 'premium', 'undecided')),
  agreed_edition text check (agreed_edition in ('standard', 'premium')),
  standard_extra_count integer not null default 0 check (standard_extra_count between 0 and 30),
  premium_extra_count integer not null default 0 check (premium_extra_count between 0 and 30),
  contact_name text not null check (length(trim(contact_name)) between 1 and 200),
  gift_recipient_name text,
  contact_email text,
  contact_phone text,
  consultation_text text not null default '',
  consent_to_contact boolean not null check (consent_to_contact),
  production_consent_at timestamptz,
  production_consent_evidence text,
  consent_recorded_by uuid references auth.users(id) on delete set null,
  status text not null default 'submitted' check
    (status in ('submitted', 'in_review', 'agreed', 'checkout_pending', 'paid', 'in_production', 'completed', 'cancelled')),
  agreed_at timestamptz,
  agreed_quote jsonb,
  order_id uuid unique references public.commerce_orders(id) on delete restrict,
  request_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_email is not null or contact_phone is not null),
  check (status not in ('agreed', 'checkout_pending', 'paid', 'in_production', 'completed') or agreed_edition is not null),
  check (status not in ('agreed', 'checkout_pending', 'paid', 'in_production', 'completed') or requester_user_id is not null),
  check (status not in ('paid', 'in_production', 'completed') or order_id is not null),
  check (status not in ('in_production', 'completed') or production_consent_at is not null)
);

create table public.commerce_v2_submission_events (
  id bigint generated always as identity primary key,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index commerce_v2_submission_events_window
  on public.commerce_v2_submission_events(ip_hash, created_at desc);

create function public.submit_commerce_v2_consultation(
  input_request_key uuid,
  input_user_id uuid,
  input_order_type text,
  input_product_preference text,
  input_standard_extra_count integer,
  input_premium_extra_count integer,
  input_contact_name text,
  input_contact_email text,
  input_contact_phone text,
  input_consultation_text text,
  input_ip_hash text,
  input_family_invitation_id uuid default null,
  input_gift_recipient_name text default null
) returns uuid language plpgsql security definer set search_path = public, auth
as $$
declare existing_id uuid; new_id uuid; invitation public.family_story_invitations%rowtype;
begin
  if input_request_key is null or input_ip_hash is null or input_ip_hash !~ '^[0-9a-f]{64}$'
    or input_order_type is null or input_order_type not in ('self', 'gift')
    or input_product_preference is null or input_product_preference not in ('standard', 'premium', 'undecided')
    or input_standard_extra_count is null or input_standard_extra_count not between 0 and 30
    or input_premium_extra_count is null or input_premium_extra_count not between 0 and 30
    or length(btrim(coalesce(input_contact_name, ''))) not between 1 and 200
    or length(coalesce(input_consultation_text, '')) > 2000
    or (nullif(btrim(coalesce(input_contact_email, '')), '') is null
      and nullif(btrim(coalesce(input_contact_phone, '')), '') is null)
    or length(coalesce(input_contact_email, '')) > 254
    or length(coalesce(input_contact_phone, '')) > 30 then
    raise exception '相談申込の内容を確認してください' using errcode = '22023';
  end if;
  if input_order_type = 'gift' and length(btrim(coalesce(input_gift_recipient_name, ''))) not between 1 and 200 then
    raise exception '贈る相手を確認してください' using errcode = '22023';
  end if;
  select id into existing_id from public.commerce_v2_consultations
    where request_key = input_request_key;
  if existing_id is not null then return existing_id; end if;
  if input_family_invitation_id is not null then
    select * into invitation from public.family_story_invitations where id = input_family_invitation_id;
    if input_user_id is null or invitation.id is null
      or invitation.status not in ('awaiting_payment', 'continuation_awaiting_payment', 'trial_completed')
      or (input_order_type = 'gift' and invitation.inviter_user_id is distinct from input_user_id)
      or (input_order_type = 'gift' and invitation.recipient_name is distinct from btrim(input_gift_recipient_name))
      or (input_order_type = 'self' and invitation.recipient_user_id is distinct from input_user_id) then
      raise exception '家族招待を確認できません' using errcode = '42501';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext(input_ip_hash));
  if (select count(*) from public.commerce_v2_submission_events
      where ip_hash = input_ip_hash and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'しばらく時間をおいてからお申し込みください' using errcode = '22023';
  end if;
  insert into public.commerce_v2_submission_events(ip_hash) values (input_ip_hash);
  insert into public.commerce_v2_consultations(
    requester_user_id, family_invitation_id, order_type, product_preference, standard_extra_count, premium_extra_count,
    contact_name, gift_recipient_name, contact_email, contact_phone, consultation_text,
    consent_to_contact, request_key
  ) values (
    input_user_id, input_family_invitation_id, input_order_type, input_product_preference, input_standard_extra_count, input_premium_extra_count,
    btrim(input_contact_name), nullif(btrim(input_gift_recipient_name), ''), nullif(lower(btrim(input_contact_email)), ''),
    nullif(btrim(input_contact_phone), ''), coalesce(input_consultation_text, ''),
    true, input_request_key
  ) returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.submit_commerce_v2_consultation(uuid,uuid,text,text,integer,integer,text,text,text,text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.submit_commerce_v2_consultation(uuid,uuid,text,text,integer,integer,text,text,text,text,text,uuid,text)
  to service_role;

alter table public.commerce_orders
  add constraint commerce_orders_consultation_id_v2_fkey
  foreign key (consultation_id_v2) references public.commerce_v2_consultations(id) on delete restrict;
create unique index commerce_orders_one_per_consultation_v2
  on public.commerce_orders(consultation_id_v2)
  where consultation_id_v2 is not null and status in ('checkout_pending', 'paid', 'zero_paid');
create unique index commerce_orders_one_per_request_v2
  on public.commerce_orders(request_key_v2) where request_key_v2 is not null;

alter table public.book_projects
  add column if not exists purchased_edition_v2 text,
  add column if not exists production_method_v2 text;
alter table public.book_projects
  add constraint book_projects_purchased_edition_v2_check
    check (purchased_edition_v2 is null or purchased_edition_v2 in ('standard', 'premium')),
  add constraint book_projects_production_method_v2_check
    check (production_method_v2 is null or production_method_v2 in ('self_or_family', 'interview_staff'));

create table public.commerce_v2_order_items (
  order_id uuid not null references public.commerce_orders(id) on delete restrict,
  product_code text not null references public.commerce_products(product_code),
  quantity integer not null check (quantity between 1 and 30),
  unit_amount_jpy integer not null check (unit_amount_jpy >= 0),
  line_amount_jpy integer generated always as (quantity * unit_amount_jpy) stored,
  primary key (order_id, product_code)
);

-- A legacy campaign cannot silently acquire a new product target. Existing
-- coupon terms stay intact; release operations must explicitly approve each
-- campaign/edition pair before it can be redeemed for the new catalog.
create table public.commerce_v2_campaign_products (
  campaign_id uuid not null references public.discount_campaigns(id) on delete cascade,
  edition text not null check (edition in ('standard', 'premium')),
  approved_at timestamptz not null,
  approval_reference text not null,
  approved_by uuid references auth.users(id) on delete set null,
  primary key (campaign_id, edition)
);

alter table public.commerce_v2_consultations enable row level security;
alter table public.commerce_v2_order_items enable row level security;
alter table public.commerce_v2_submission_events enable row level security;
alter table public.commerce_v2_campaign_products enable row level security;
-- Submission and staff workflows use separately authenticated Edge Functions.
-- No direct client grants: contact details and quotes must not be enumerable.
revoke all on public.commerce_v2_consultations from anon, authenticated;
revoke all on public.commerce_v2_order_items from anon, authenticated;
revoke all on public.commerce_v2_submission_events from anon, authenticated;
revoke all on public.commerce_v2_campaign_products from anon, authenticated;
grant select, insert, update, delete on public.commerce_v2_consultations to service_role;
grant select, insert, update, delete on public.commerce_v2_order_items to service_role;
grant select, insert, update, delete on public.commerce_v2_submission_events to service_role;
grant select, insert, update, delete on public.commerce_v2_campaign_products to service_role;
grant usage, select on sequence public.commerce_v2_submission_events_id_seq to service_role;

-- The only quote entry point for V2. A service-role checkout endpoint supplies
-- the authenticated purchaser ID; the browser never supplies an amount.
create function public.get_commerce_v2_quote(
  input_edition text,
  input_production_method text,
  input_standard_extra_count integer,
  input_premium_extra_count integer,
  input_purchaser_user_id uuid,
  input_discount_code text default null,
  input_consultation_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public, auth
as $$
declare
  base_product public.commerce_products%rowtype;
  standard_product public.commerce_products%rowtype;
  premium_product public.commerce_products%rowtype;
  support_product public.commerce_products%rowtype;
  consultation public.commerce_v2_consultations%rowtype;
  code_row public.discount_codes%rowtype;
  campaign public.discount_campaigns%rowtype;
  normalized text := public.normalize_discount_code(input_discount_code);
  subtotal integer;
  discount integer := 0;
  discount_basis integer;
  used_count integer;
  lines jsonb;
begin
  if input_edition not in ('standard', 'premium')
    or input_production_method not in ('self_or_family', 'interview_staff')
    or input_standard_extra_count not between 0 and 30
    or input_premium_extra_count not between 0 and 30
    or input_purchaser_user_id is null then
    raise exception '注文内容が正しくありません' using errcode = '22023';
  end if;
  if input_production_method = 'interview_staff' then
    select * into consultation from public.commerce_v2_consultations
      where id = input_consultation_id;
    if consultation.id is null or consultation.status not in ('agreed', 'checkout_pending')
      or consultation.agreed_edition is distinct from input_edition
      or consultation.standard_extra_count is distinct from input_standard_extra_count
      or consultation.premium_extra_count is distinct from input_premium_extra_count
      or consultation.requester_user_id is distinct from input_purchaser_user_id then
      raise exception '相談内容の合意を確認できません' using errcode = '22023';
    end if;
  elsif input_consultation_id is not null then
    raise exception '相談申込と通常制作を混在できません' using errcode = '22023';
  end if;

  select * into base_product from public.commerce_products
    where product_code = case input_edition when 'standard' then 'standard_bundle_v2' else 'premium_bundle_v2' end
      and is_active = true;
  select * into standard_product from public.commerce_products
    where product_code = 'standard_extra_v2' and is_active = true;
  select * into premium_product from public.commerce_products
    where product_code = 'premium_extra_v2' and is_active = true;
  select * into support_product from public.commerce_products
    where product_code = 'interview_support_v1' and is_active = true;
  if base_product.product_code is null
    or (input_standard_extra_count > 0 and standard_product.product_code is null)
    or (input_premium_extra_count > 0 and premium_product.product_code is null)
    or (input_production_method = 'interview_staff' and support_product.product_code is null) then
    raise exception '販売商品を確認できません' using errcode = 'P0002';
  end if;
  subtotal := base_product.amount_jpy
    + input_standard_extra_count * coalesce(standard_product.amount_jpy, 0)
    + input_premium_extra_count * coalesce(premium_product.amount_jpy, 0)
    + case when input_production_method = 'interview_staff' then support_product.amount_jpy else 0 end;

  if normalized <> '' then
    select * into code_row from public.discount_codes
      where normalized_code = normalized and is_active = true;
    if code_row.id is null then raise exception '割引コードを確認できません' using errcode = '22023'; end if;
    select * into campaign from public.discount_campaigns where id = code_row.campaign_id;
    -- V2-specific campaigns and explicitly approved legacy campaign mappings
    -- only. A legacy self_book_v1 code is never silently remapped.
    if campaign.id is null
      or (campaign.product_code <> base_product.product_code
        and not exists (select 1 from public.commerce_v2_campaign_products mapping
          where mapping.campaign_id = campaign.id and mapping.edition = input_edition))
      or campaign.status not in ('active', 'scheduled')
      or (campaign.starts_at is not null and campaign.starts_at > now())
      or (campaign.ends_at is not null and campaign.ends_at <= now())
      or (code_row.expires_at is not null and code_row.expires_at <= now()) then
      raise exception 'この割引コードは現在利用できません' using errcode = '22023';
    end if;
    select count(*) into used_count from public.discount_redemptions
      where discount_code_id = code_row.id and status in ('pending', 'redeemed');
    if code_row.max_redemptions is not null and used_count >= code_row.max_redemptions then
      raise exception 'この割引コードは使用中または使用済みです' using errcode = '22023';
    end if;
    if campaign.max_redemptions is not null and (
      select count(*) from public.discount_redemptions
      where campaign_id = campaign.id and status in ('pending', 'redeemed')
    ) >= campaign.max_redemptions then
      raise exception 'このキャンペーンは終了しました' using errcode = '22023';
    end if;
    if campaign.one_per_account and exists (
      select 1 from public.discount_redemptions
      where campaign_id = campaign.id and purchaser_user_id = input_purchaser_user_id
        and status in ('pending', 'redeemed')
    ) then raise exception 'この割引は1アカウントにつき1回利用できます' using errcode = '22023'; end if;
    -- The approved carry-over covers the two book editions and their extra
    -- books. Interview support is a new, separate service and is not silently
    -- made free by a legacy entire-order coupon.
    discount_basis := case
      when campaign.discount_scope = 'entire_order' and campaign.product_code = 'self_book_v1'
        then subtotal - case when input_production_method = 'interview_staff' then support_product.amount_jpy else 0 end
      when campaign.discount_scope = 'entire_order' then subtotal
      else base_product.amount_jpy
    end;
    discount := case campaign.discount_type
      when 'full' then discount_basis
      when 'percent' then round(discount_basis * campaign.discount_value / 100.0)::integer
      else least(discount_basis, campaign.discount_value::integer)
    end;
    discount := greatest(0, least(discount_basis, discount));
  end if;

  select jsonb_agg(jsonb_build_object(
    'product_code', product_code, 'quantity', quantity,
    'unit_amount_jpy', unit_amount_jpy, 'line_amount_jpy', quantity * unit_amount_jpy
  ) order by ordinal) into lines
  from (values
    (1, base_product.product_code, 1, base_product.amount_jpy),
    (2, 'standard_extra_v2', input_standard_extra_count, coalesce(standard_product.amount_jpy, 0)),
    (3, 'premium_extra_v2', input_premium_extra_count, coalesce(premium_product.amount_jpy, 0)),
    (4, 'interview_support_v1', case when input_production_method = 'interview_staff' then 1 else 0 end,
      coalesce(support_product.amount_jpy, 0))
  ) as item(ordinal, product_code, quantity, unit_amount_jpy)
  where quantity > 0;

  return jsonb_build_object(
    'pricing_version', 'v2', 'edition', input_edition,
    'production_method', input_production_method, 'lines', lines,
    'amount_subtotal', subtotal, 'discount_amount', discount,
    'amount_total', subtotal - discount, 'currency', 'jpy',
    'tax_included', true, 'discount_code_id', code_row.id,
    'campaign_id', campaign.id, 'discount_scope', coalesce(campaign.discount_scope, 'base_product')
  );
end;
$$;
revoke all on function public.get_commerce_v2_quote(text,text,integer,integer,uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.get_commerce_v2_quote(text,text,integer,integer,uuid,text,uuid)
  to service_role;

create function public.create_commerce_v2_order(
  input_purchaser_user_id uuid,
  input_book_project_id uuid,
  input_order_type text,
  input_edition text,
  input_production_method text,
  input_standard_extra_count integer,
  input_premium_extra_count integer,
  input_discount_code text,
  input_consultation_id uuid,
  input_request_key uuid,
  input_expected_quote jsonb,
  input_gift jsonb default '{}'::jsonb,
  input_family_invitation_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare
  quote jsonb;
  existing_order public.commerce_orders%rowtype;
  order_row public.commerce_orders%rowtype;
  consultation public.commerce_v2_consultations%rowtype;
  invitation public.family_story_invitations%rowtype;
  code_row public.discount_codes%rowtype;
  campaign public.discount_campaigns%rowtype;
  item jsonb;
  used_count integer;
  claim_token text;
  claim_code text;
  guarantee_days integer := 45;
begin
  if input_purchaser_user_id is null or input_request_key is null then
    raise exception '購入者とリクエストキーが必要です' using errcode = '22023';
  end if;
  if input_order_type not in ('self', 'gift') then
    raise exception '注文種別が正しくありません' using errcode = '22023';
  end if;
  if input_order_type = 'self' then
    if not exists (select 1 from public.book_projects
      where id = input_book_project_id
        and (owner_user_id = input_purchaser_user_id
          or (public.family_managed(id) and public.family_supporter(id, input_purchaser_user_id)))
        and access_status not in ('paid', 'gifted', 'legacy')) then
      raise exception 'この物語の新規購入を開始できません' using errcode = '42501';
    end if;
  elsif input_book_project_id is not null
    or nullif(btrim(input_gift ->> 'recipient_name'), '') is null then
    raise exception '贈る相手を確認してください' using errcode = '22023';
  end if;
  -- A previous attempt may already have linked the family invitation. The
  -- same purchaser/request key must be able to recover that exact order.
  select * into existing_order from public.commerce_orders
    where request_key_v2 = input_request_key for update;
  if existing_order.id is not null then
    if existing_order.purchaser_user_id is distinct from input_purchaser_user_id then
      raise exception 'リクエストキーが重複しています' using errcode = '23505';
    end if;
    if existing_order.order_type is distinct from input_order_type
      or existing_order.book_project_id is distinct from
        (case when input_order_type = 'self' then input_book_project_id else null end)
      or existing_order.edition_v2 is distinct from input_edition
      or existing_order.production_method_v2 is distinct from input_production_method
      or existing_order.standard_extra_copy_count is distinct from input_standard_extra_count
      or existing_order.premium_copy_count is distinct from input_premium_extra_count
      or existing_order.consultation_id_v2 is distinct from input_consultation_id
      or input_family_invitation_id is distinct from (
        select id from public.family_story_invitations
          where commerce_order_id = existing_order.id limit 1
      ) or (input_order_type = 'gift' and not exists (
        select 1 from public.gift_orders where commerce_order_id = existing_order.id
          and recipient_name = btrim(input_gift ->> 'recipient_name')
      )) then
      raise exception '再試行の注文内容が一致しません' using errcode = '22023';
    end if;
    return jsonb_build_object('order', to_jsonb(existing_order),
      'quote', existing_order.quote_snapshot_v2, 'reused', true);
  end if;
  if input_family_invitation_id is not null then
    select * into invitation from public.family_story_invitations
      where id = input_family_invitation_id for update;
    if invitation.id is null or invitation.commerce_order_id is not null
      or invitation.status not in ('awaiting_payment', 'continuation_awaiting_payment', 'trial_completed')
      or (input_order_type = 'gift' and (invitation.inviter_user_id is distinct from input_purchaser_user_id
        or nullif(btrim(input_gift ->> 'recipient_name'), '') is distinct from invitation.recipient_name))
      or (input_order_type = 'self' and (invitation.recipient_user_id is distinct from input_purchaser_user_id
        or invitation.recipient_project_id is distinct from input_book_project_id)) then
      raise exception '家族招待と購入者を確認できません' using errcode = '42501';
    end if;
  end if;

  if input_consultation_id is not null then
    select * into consultation from public.commerce_v2_consultations
      where id = input_consultation_id for update;
    if consultation.id is null or consultation.status not in ('agreed', 'checkout_pending')
      or consultation.order_type is distinct from input_order_type
      or consultation.requester_user_id is distinct from input_purchaser_user_id
      or consultation.family_invitation_id is distinct from input_family_invitation_id
      or (input_order_type = 'gift' and consultation.gift_recipient_name is distinct from btrim(input_gift ->> 'recipient_name')) then
      raise exception '相談申込を確認できません' using errcode = '22023';
    end if;
    if consultation.order_id is not null then
      select * into existing_order from public.commerce_orders where id = consultation.order_id;
      if existing_order.id is not null and existing_order.status in ('checkout_pending', 'paid', 'zero_paid') then
        return jsonb_build_object('order', to_jsonb(existing_order),
          'quote', existing_order.quote_snapshot_v2, 'reused', true);
      end if;
    end if;
  end if;

  quote := public.get_commerce_v2_quote(input_edition, input_production_method,
    input_standard_extra_count, input_premium_extra_count,
    input_purchaser_user_id, input_discount_code, input_consultation_id);
  if input_expected_quote is distinct from quote then
    raise exception 'お申し込み内容・金額が変更されました。再確認してください' using errcode = '22023';
  end if;

  if quote ->> 'discount_code_id' is not null then
    select * into code_row from public.discount_codes
      where id = (quote ->> 'discount_code_id')::uuid for update;
    select * into campaign from public.discount_campaigns
      where id = code_row.campaign_id for update;
    select count(*) into used_count from public.discount_redemptions
      where discount_code_id = code_row.id and status in ('pending', 'redeemed');
    if code_row.max_redemptions is not null and used_count >= code_row.max_redemptions then
      raise exception 'この割引コードは使用中または使用済みです' using errcode = '22023';
    end if;
    if campaign.max_redemptions is not null and (
      select count(*) from public.discount_redemptions
      where campaign_id = campaign.id and status in ('pending', 'redeemed')
    ) >= campaign.max_redemptions then
      raise exception 'このキャンペーンは終了しました' using errcode = '22023';
    end if;
    if campaign.one_per_account and exists (
      select 1 from public.discount_redemptions
      where campaign_id = campaign.id and purchaser_user_id = input_purchaser_user_id
        and status in ('pending', 'redeemed')
    ) then raise exception 'この割引は1アカウントにつき1回利用できます' using errcode = '22023'; end if;
  end if;

  insert into public.commerce_orders (
    purchaser_user_id, book_project_id, order_type, product_code,
    amount_subtotal, discount_amount, amount_total, currency, discount_code_id,
    status, includes_base_book, base_book_amount, standard_extra_copy_count,
    premium_copy_count, requested_standard_extra_copy_count,
    requested_premium_copy_count, gift_package_selected, metadata,
    edition_v2, production_method_v2, pricing_version, consultation_id_v2,
    request_key_v2, quote_snapshot_v2
  ) values (
    input_purchaser_user_id, case when input_order_type = 'self' then input_book_project_id else null end,
    input_order_type, case input_edition when 'standard' then 'standard_bundle_v2' else 'premium_bundle_v2' end,
    (quote ->> 'amount_subtotal')::integer, (quote ->> 'discount_amount')::integer,
    (quote ->> 'amount_total')::integer, 'jpy', nullif(quote ->> 'discount_code_id', '')::uuid,
    'checkout_pending', true, (quote -> 'lines' -> 0 ->> 'line_amount_jpy')::integer,
    input_standard_extra_count, input_premium_extra_count,
    input_standard_extra_count, input_premium_extra_count, false,
    jsonb_build_object('pricing_version', 'v2'),
    input_edition, input_production_method, 'v2', input_consultation_id,
    input_request_key, quote
  ) returning * into order_row;

  for item in select * from jsonb_array_elements(quote -> 'lines') loop
    insert into public.commerce_v2_order_items(order_id, product_code, quantity, unit_amount_jpy)
    values (order_row.id, item ->> 'product_code',
      (item ->> 'quantity')::integer, (item ->> 'unit_amount_jpy')::integer);
  end loop;
  if code_row.id is not null then
    insert into public.discount_redemptions(
      discount_code_id, campaign_id, commerce_order_id, purchaser_user_id, amount_discounted
    ) values (code_row.id, campaign.id, order_row.id, input_purchaser_user_id,
      (quote ->> 'discount_amount')::integer);
  end if;

  if input_order_type = 'gift' then
    -- New V2 gifts use the same 45-day term as experience_contracts.
    -- Legacy gift orders retain their existing commerce setting unchanged.
    guarantee_days := 45;
    claim_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    claim_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    insert into public.gift_orders(
      commerce_order_id, recipient_name, recipient_email, gift_message,
      package_selected, package_status, shipping_address, guarantee_days,
      claim_token, claim_code
    ) values (order_row.id, nullif(btrim(input_gift ->> 'recipient_name'), ''),
      nullif(lower(btrim(input_gift ->> 'recipient_email')), ''),
      nullif(btrim(input_gift ->> 'gift_message'), ''), false, 'not_requested',
      '{}'::jsonb, guarantee_days, claim_token, claim_code);
  end if;
  if invitation.id is not null then
    update public.family_story_invitations set commerce_order_id = order_row.id,
      updated_at = now() where id = invitation.id;
  end if;
  if consultation.id is not null then
    update public.commerce_v2_consultations set
      status = 'checkout_pending', order_id = order_row.id,
      agreed_quote = quote, updated_at = now()
    where id = consultation.id;
  end if;
  return jsonb_build_object('order', to_jsonb(order_row), 'quote', quote, 'reused', false);
end;
$$;
revoke all on function public.create_commerce_v2_order(uuid,uuid,text,text,text,integer,integer,text,uuid,uuid,jsonb,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.create_commerce_v2_order(uuid,uuid,text,text,text,integer,integer,text,uuid,uuid,jsonb,jsonb,uuid)
  to service_role;

-- A completed work may be ordered again without charging for the base bundle.
-- Existing coupons remain base-purchase-only, as in get_book_order_quote.
create function public.get_commerce_v2_additional_quote(
  input_project_id uuid, input_purchaser_user_id uuid,
  input_standard_count integer, input_premium_count integer
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  project_row public.book_projects%rowtype;
  work_row public.book_work_manifests%rowtype;
  standard_product public.commerce_products%rowtype;
  premium_product public.commerce_products%rowtype;
  lines jsonb;
  subtotal integer;
begin
  if input_purchaser_user_id is null or input_standard_count is null
    or input_premium_count is null or input_standard_count not between 0 and 30
    or input_premium_count not between 0 and 30
    or input_standard_count + input_premium_count = 0 then
    raise exception '追加冊子の冊数を確認してください' using errcode = '22023';
  end if;
  select * into project_row from public.book_projects where id = input_project_id;
  select * into work_row from public.book_work_manifests where book_project_id = input_project_id;
  if project_row.id is null or project_row.purchased_edition_v2 is null
    or project_row.access_status not in ('paid', 'gifted')
    or work_row.confirmed_at is null or work_row.snapshot is null
    or (project_row.owner_user_id is distinct from input_purchaser_user_id
      and not exists (select 1 from public.commerce_orders base
        where base.book_project_id = input_project_id
          and base.purchaser_user_id = input_purchaser_user_id
          and base.includes_base_book and base.pricing_version = 'v2'
          and base.status in ('paid', 'zero_paid'))
      and not (public.family_managed(input_project_id)
        and public.family_supporter(input_project_id, input_purchaser_user_id))) then
    raise exception 'この作品の追加冊子を注文できません' using errcode = '42501';
  end if;
  select * into standard_product from public.commerce_products
    where product_code = 'standard_extra_v2' and is_active = true;
  select * into premium_product from public.commerce_products
    where product_code = 'premium_extra_v2' and is_active = true;
  if (input_standard_count > 0 and (standard_product.product_code is null
      or standard_product.currency <> 'jpy' or standard_product.tax_included is not true))
    or (input_premium_count > 0 and (premium_product.product_code is null
      or premium_product.currency <> 'jpy' or premium_product.tax_included is not true)) then
    raise exception '販売商品を確認できません' using errcode = 'P0002';
  end if;
  subtotal := input_standard_count * coalesce(standard_product.amount_jpy, 0)
    + input_premium_count * coalesce(premium_product.amount_jpy, 0);
  select jsonb_agg(jsonb_build_object('product_code', product_code,
    'quantity', quantity, 'unit_amount_jpy', unit_amount_jpy,
    'line_amount_jpy', quantity * unit_amount_jpy) order by ordinal)
  into lines from (values
    (1, 'standard_extra_v2', input_standard_count, coalesce(standard_product.amount_jpy, 0)),
    (2, 'premium_extra_v2', input_premium_count, coalesce(premium_product.amount_jpy, 0))
  ) item(ordinal, product_code, quantity, unit_amount_jpy) where quantity > 0;
  return jsonb_build_object('pricing_version', 'v2', 'order_kind', 'additional_copies',
    'edition', project_row.purchased_edition_v2,
    'production_method', project_row.production_method_v2,
    'standard_extra_count', input_standard_count,
    'premium_extra_count', input_premium_count,
    'lines', lines, 'amount_subtotal', subtotal, 'discount_amount', 0,
    'amount_total', subtotal, 'currency', 'jpy', 'tax_included', true);
end;
$$;
revoke all on function public.get_commerce_v2_additional_quote(uuid,uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.get_commerce_v2_additional_quote(uuid,uuid,integer,integer)
  to service_role;

create function public.create_commerce_v2_additional_order(
  input_project_id uuid, input_purchaser_user_id uuid,
  input_standard_count integer, input_premium_count integer,
  input_request_key uuid, input_expected_quote jsonb,
  input_shipping_address jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  quote jsonb;
  project_row public.book_projects%rowtype;
  order_row public.commerce_orders%rowtype;
  item jsonb;
begin
  if input_request_key is null or input_shipping_address is null
    or jsonb_typeof(input_shipping_address) <> 'object'
    or exists (select 1 from (values ('recipient_name'), ('postal_code'),
      ('prefecture'), ('city'), ('line1')) required(field)
      where length(btrim(coalesce(input_shipping_address ->> field, ''))) not between 1 and 200) then
    raise exception 'お届け先を確認してください' using errcode = '22023';
  end if;
  select * into project_row from public.book_projects where id = input_project_id for update;
  select * into order_row from public.commerce_orders
    where request_key_v2 = input_request_key for update;
  if order_row.id is not null then
    if order_row.purchaser_user_id is distinct from input_purchaser_user_id
      or order_row.book_project_id is distinct from input_project_id
      or order_row.includes_base_book
      or order_row.standard_extra_copy_count is distinct from input_standard_count
      or order_row.premium_copy_count is distinct from input_premium_count
      or order_row.shipping_address is distinct from input_shipping_address then
      raise exception '再試行の注文内容が一致しません' using errcode = '22023';
    end if;
    return jsonb_build_object('order', to_jsonb(order_row),
      'quote', order_row.quote_snapshot_v2, 'reused', true);
  end if;
  quote := public.get_commerce_v2_additional_quote(input_project_id,
    input_purchaser_user_id, input_standard_count, input_premium_count);
  if quote is distinct from input_expected_quote then
    raise exception 'お申し込み内容・金額が変更されました。再確認してください' using errcode = '22023';
  end if;
  select * into order_row from public.commerce_orders pending
    where pending.book_project_id = input_project_id
      and pending.pricing_version = 'v2' and not pending.includes_base_book
      and pending.status = 'checkout_pending' for update;
  if order_row.id is not null then
    if order_row.purchaser_user_id is distinct from input_purchaser_user_id
      or order_row.standard_extra_copy_count is distinct from input_standard_count
      or order_row.premium_copy_count is distinct from input_premium_count
      or order_row.shipping_address is distinct from input_shipping_address
      or order_row.quote_snapshot_v2 is distinct from quote then
      raise exception '先の追加冊子決済を確認してください' using errcode = '22023';
    end if;
    return jsonb_build_object('order', to_jsonb(order_row),
      'quote', order_row.quote_snapshot_v2, 'reused', true);
  end if;
  insert into public.commerce_orders (
    purchaser_user_id, book_project_id, order_type, product_code,
    amount_subtotal, discount_amount, amount_total, currency, status,
    includes_base_book, base_book_amount, standard_extra_copy_count,
    premium_copy_count, requested_standard_extra_copy_count,
    requested_premium_copy_count, gift_package_selected, shipping_address,
    edition_v2, production_method_v2, pricing_version, request_key_v2,
    quote_snapshot_v2, metadata
  ) values (
    input_purchaser_user_id, input_project_id, 'self',
    case when input_standard_count > 0 then 'standard_extra_v2' else 'premium_extra_v2' end,
    (quote ->> 'amount_subtotal')::integer, 0, (quote ->> 'amount_total')::integer,
    'jpy', 'checkout_pending', false, 0, input_standard_count, input_premium_count,
    coalesce(project_row.ordered_standard_extra_copy_count, 0) + input_standard_count,
    coalesce(project_row.ordered_premium_copy_count, 0) + input_premium_count,
    false, input_shipping_address, project_row.purchased_edition_v2,
    project_row.production_method_v2, 'v2', input_request_key, quote,
    jsonb_build_object('order_kind', 'additional_copies')
  ) returning * into order_row;
  for item in select * from jsonb_array_elements(quote -> 'lines') loop
    insert into public.commerce_v2_order_items(order_id, product_code, quantity, unit_amount_jpy)
    values (order_row.id, item ->> 'product_code',
      (item ->> 'quantity')::integer, (item ->> 'unit_amount_jpy')::integer);
  end loop;
  return jsonb_build_object('order', to_jsonb(order_row), 'quote', quote, 'reused', false);
end;
$$;
revoke all on function public.create_commerce_v2_additional_order(uuid,uuid,integer,integer,uuid,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_commerce_v2_additional_order(uuid,uuid,integer,integer,uuid,jsonb,jsonb)
  to service_role;

-- Initial V2 payment precedes the customer's final page approval. Queue its
-- physical/Web Book proof only after the existing confirmation RPC has frozen
-- a work manifest; never use a later answer as the source.
create function public.queue_commerce_v2_paid_work(
  input_project_id uuid, input_actor_id uuid
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  project_row public.book_projects%rowtype;
  work_row public.book_work_manifests%rowtype;
  order_row public.commerce_orders%rowtype;
  source_hash text;
  prepared public.book_order_work_snapshots%rowtype;
begin
  select * into project_row from public.book_projects where id = input_project_id for update;
  if project_row.id is null or project_row.purchased_edition_v2 is null
    or project_row.production_method_v2 <> 'self_or_family'
    or project_row.access_status not in ('paid', 'gifted')
    or (project_row.owner_user_id is distinct from input_actor_id
      and not (public.family_managed(input_project_id)
        and public.family_creator(input_project_id, input_actor_id))) then
    raise exception '制作対象を確認できません' using errcode = '42501';
  end if;
  select * into work_row from public.book_work_manifests
    where book_project_id = input_project_id for update;
  if work_row.confirmed_at is null or work_row.snapshot is null then
    raise exception '先に作品を確定してください' using errcode = '22023';
  end if;
  select * into order_row from public.commerce_orders
    where book_project_id = input_project_id and pricing_version = 'v2'
      and includes_base_book and status in ('paid', 'zero_paid')
    order by purchased_at desc limit 1 for update;
  if order_row.id is null or order_row.edition_v2 is distinct from project_row.purchased_edition_v2
    or order_row.production_method_v2 is distinct from project_row.production_method_v2 then
    raise exception '支払済みの作品を確認できません' using errcode = '22023';
  end if;
  source_hash := encode(extensions.digest(work_row.snapshot::text, 'sha256'), 'hex');
  insert into public.book_order_work_snapshots(
    order_id, book_project_id, work_manifest_id, work_revision, snapshot, source_sha256
  ) values (
    order_row.id, input_project_id, work_row.id, work_row.revision,
    work_row.snapshot, source_hash
  ) on conflict (order_id) do nothing;
  select * into prepared from public.book_order_work_snapshots where order_id = order_row.id;
  if prepared.work_manifest_id is distinct from work_row.id
    or prepared.source_sha256 is distinct from source_hash then
    raise exception '確定作品と注文のスナップショットが一致しません';
  end if;
  insert into public.book_production_jobs(
    order_id, book_project_id, work_manifest_id, source_sha256
  ) values (order_row.id, input_project_id, work_row.id, source_hash)
  on conflict (order_id) do nothing;
  return order_row.id;
end;
$$;
revoke all on function public.queue_commerce_v2_paid_work(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.queue_commerce_v2_paid_work(uuid,uuid)
  to service_role;

-- Preserve the old no-reprint rule for legacy orders. V2 verifies its immutable
-- item snapshot instead of inheriting the old base-only restriction.
create or replace function public.register_experience_contract(input_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$
declare
  o public.commerce_orders%rowtype;
  p public.book_projects%rowtype;
  c public.experience_contracts%rowtype;
  base_amount integer;
  purchase_kind text;
  item_subtotal integer;
begin
  select * into o from public.commerce_orders where id = input_order_id for update;
  select * into c from public.experience_contracts where order_id = input_order_id;
  if c.order_id is not null then return to_jsonb(c); end if;
  if o.id is null or o.status <> 'checkout_pending'
    or o.order_type not in ('self', 'gift') or not o.includes_base_book then
    raise exception 'Only a new unpaid base-book order can adopt v2 terms';
  end if;
  if o.pricing_version = 'v2' then
    select sum(line_amount_jpy)::integer into item_subtotal
    from public.commerce_v2_order_items where order_id = o.id;
    if o.edition_v2 not in ('standard', 'premium')
      or o.production_method_v2 not in ('self_or_family', 'interview_staff')
      or item_subtotal is distinct from o.amount_subtotal
      or not exists (select 1 from public.commerce_v2_order_items
        where order_id = o.id and product_code = o.product_code and quantity = 1)
      or (o.production_method_v2 = 'interview_staff' and o.consultation_id_v2 is null) then
      raise exception 'V2 order snapshot is incomplete';
    end if;
  elsif coalesce(o.standard_extra_copy_count, 0) > 0
    or coalesce(o.premium_copy_count, 0) > 0 then
    raise exception 'V2 base purchase must not include reprint options';
  end if;
  if o.book_project_id is not null then
    select * into p from public.book_projects where id = o.book_project_id;
    if p.subject_person_id is null then raise exception 'A subject Person is required'; end if;
  elsif o.order_type = 'self' then
    raise exception 'A self purchase requires a project';
  end if;
  purchase_kind := o.order_type;
  if p.id is not null and public.family_managed(p.id)
    and not public.family_subject(p.id, o.purchaser_user_id) then
    if not public.family_supporter(p.id, o.purchaser_user_id) then
      raise exception 'Family payer access required';
    end if;
    purchase_kind := 'gift';
  end if;
  base_amount := greatest(0,
    coalesce(nullif(o.base_book_amount, 0), o.amount_subtotal, 0) - o.discount_amount);
  insert into public.experience_contracts(
    order_id, policy_version, book_project_id, subject_person_id,
    purchaser_user_id, purchase_kind, guarantee_days, base_paid_amount
  ) values (
    o.id, case when purchase_kind = 'gift' then '2.0' else '2.1' end,
    p.id, p.subject_person_id, o.purchaser_user_id, purchase_kind,
    case when purchase_kind = 'gift' then 45 else null end, base_amount
  ) returning * into c;
  return to_jsonb(c);
end;
$$;

-- A paid interview order is a waiting-for-staff case, not a self-production
-- entitlement. This follows the production function body, changing only the
-- V2 interview branch that would otherwise start its one-year clock at pay.
create or replace function public.confirm_experience_payment(
  input_order_id uuid, input_confirmed_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public, auth
as $$
declare o public.commerce_orders%rowtype; c public.experience_contracts%rowtype;
begin
  select * into o from public.commerce_orders where id = input_order_id for update;
  select * into c from public.experience_contracts where order_id = input_order_id for update;
  if c.order_id is null then return jsonb_build_object('version', 'legacy'); end if;
  if o.status not in ('paid', 'zero_paid') then raise exception 'Payment is not confirmed'; end if;
  if input_confirmed_at is null or input_confirmed_at < o.created_at - interval '5 minutes'
    or input_confirmed_at > now() + interval '5 minutes' then
    raise exception 'Invalid payment confirmation time';
  end if;
  if c.payment_confirmed_at is null then
    update public.experience_contracts set
      payment_confirmed_at = input_confirmed_at,
      guarantee_expires_at = case when guarantee_days is not null
        then input_confirmed_at + make_interval(days => guarantee_days) end,
      gift_activation_expires_at = case when purchase_kind = 'gift'
        then input_confirmed_at + interval '6 months' end,
      production_started_at = case when purchase_kind = 'self'
        and not (o.pricing_version = 'v2' and o.production_method_v2 = 'interview_staff')
        then input_confirmed_at end,
      production_expires_at = case when purchase_kind = 'self'
        and not (o.pricing_version = 'v2' and o.production_method_v2 = 'interview_staff')
        then input_confirmed_at + interval '1 year' end
    where order_id = input_order_id returning * into c;
  end if;
  return to_jsonb(c);
end;
$$;

-- The normal paid-start RPC must not bypass the interview wait state, even
-- when a bookmarked onboarding URL is opened directly.
create or replace function public.start_paid_starting_chapter(
  input_project_id uuid, input_subject_intent_confirmed boolean
) returns jsonb language plpgsql security definer set search_path = public, auth
as $$
declare c public.experience_contracts%rowtype;
begin
  if not public.can_confirm_experience_intent(input_project_id) then
    raise exception 'Project access is required' using errcode = '42501';
  end if;
  if input_subject_intent_confirmed is distinct from true then
    raise exception 'The subject must choose to begin';
  end if;
  select * into c from public.experience_contracts
    where book_project_id = input_project_id and payment_confirmed_at is not null
      and refund_confirmed_at is null for update;
  if c.order_id is null then raise exception 'An active v2 purchase is required'; end if;
  if exists (select 1 from public.commerce_orders o where o.id = c.order_id
    and o.pricing_version = 'v2' and o.production_method_v2 = 'interview_staff') then
    raise exception 'Staff interview production must be started by the consent workflow'
      using errcode = '42501';
  end if;
  if exists (select 1 from public.experience_refund_requests where order_id = c.order_id) then
    raise exception 'A refund request is being processed';
  end if;
  if c.production_started_at is null then
    if c.gift_activation_expires_at is null or now() > c.gift_activation_expires_at then
      raise exception 'Please contact support to extend the gift activation period';
    end if;
    update public.experience_contracts set production_started_at = now(),
      production_expires_at = now() + interval '1 year'
      where order_id = c.order_id returning * into c;
  end if;
  if now() > c.production_expires_at then
    raise exception 'Please contact support to extend the production period';
  end if;
  return jsonb_build_object('production_started_at', c.production_started_at,
    'production_expires_at', c.production_expires_at);
end;
$$;

create function public.settle_commerce_v2_snapshot()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.pricing_version = 'v2' and new.status in ('paid', 'zero_paid')
    and old.status is distinct from new.status then
    -- A later V2 extra-copy payment must not rewrite the original edition or
    -- production method of the completed work.
    if new.includes_base_book and new.book_project_id is not null then
      update public.book_projects set
        purchased_edition_v2 = new.edition_v2,
        production_method_v2 = new.production_method_v2
      where id = new.book_project_id;
    end if;
    if new.consultation_id_v2 is not null then
      update public.commerce_v2_consultations set
        status = 'paid', order_id = new.id, updated_at = now()
      where id = new.consultation_id_v2
        and status in ('agreed', 'checkout_pending', 'paid');
      if not found then raise exception '相談申込との紐付けに失敗しました'; end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger settle_commerce_v2_snapshot_after_payment
after update of status on public.commerce_orders
for each row execute function public.settle_commerce_v2_snapshot();

create function public.bind_commerce_v2_gift_edition()
returns trigger language plpgsql security definer set search_path = public
as $$
declare purchase public.commerce_orders%rowtype;
begin
  if new.recipient_project_id is not null and new.claimed_at is not null then
    select * into purchase from public.commerce_orders where id = new.commerce_order_id;
    if purchase.pricing_version = 'v2' and purchase.status in ('paid', 'zero_paid') then
      update public.book_projects set
        purchased_edition_v2 = purchase.edition_v2,
        production_method_v2 = purchase.production_method_v2
      where id = new.recipient_project_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger bind_commerce_v2_gift_edition_after_claim
after insert or update of recipient_project_id, claimed_at on public.gift_orders
for each row execute function public.bind_commerce_v2_gift_edition();

commit;
