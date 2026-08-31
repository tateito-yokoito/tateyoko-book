begin;

alter table public.discount_campaigns
  add column if not exists discount_scope text not null default 'base_product';

alter table public.discount_campaigns
  drop constraint if exists discount_campaigns_campaign_type_check,
  drop constraint if exists discount_campaigns_discount_scope_check,
  drop constraint if exists discount_campaigns_entire_order_test_check;

alter table public.discount_campaigns
  add constraint discount_campaigns_campaign_type_check check (
    campaign_type in ('crowdfunding', 'advertising', 'agency', 'internal_test')
  ),
  add constraint discount_campaigns_discount_scope_check check (
    discount_scope in ('base_product', 'entire_order')
  ),
  add constraint discount_campaigns_entire_order_test_check check (
    discount_scope <> 'entire_order'
    or (
      campaign_type = 'internal_test'
      and discount_type = 'full'
      and discount_value = 100
      and one_per_account = true
      and ends_at is not null
    )
  );

alter table public.commerce_orders
  drop constraint if exists commerce_order_discount_check;

alter table public.commerce_orders
  add constraint commerce_order_discount_check check (
    discount_amount <= amount_subtotal + gift_package_amount
  );

create or replace function public.get_discount_scope_for_quote(input_campaign_id uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((
    select c.discount_scope
    from public.discount_campaigns c
    where c.id = input_campaign_id
      and c.status in ('active', 'scheduled')
      and (c.starts_at is null or c.starts_at <= now())
      and (c.ends_at is null or c.ends_at > now())
  ), 'base_product');
$$;

revoke all on function public.get_discount_scope_for_quote(uuid) from public;
grant execute on function public.get_discount_scope_for_quote(uuid) to authenticated, service_role;

create or replace function public.admin_save_discount_campaign(input_campaign jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  campaign_row public.discount_campaigns%rowtype;
  requested_scope text := coalesce(nullif(input_campaign ->> 'discount_scope', ''), 'base_product');
  requested_type text := input_campaign ->> 'campaign_type';
  requested_discount_type text := input_campaign ->> 'discount_type';
  requested_ends_at timestamptz := nullif(input_campaign ->> 'ends_at', '')::timestamptz;
  requested_one_per_account boolean := coalesce((input_campaign ->> 'one_per_account')::boolean, false);
begin
  if not public.is_admin_sales_mode_active() then
    raise exception '販売管理モードが必要です' using errcode = '42501';
  end if;

  if requested_scope = 'entire_order' then
    if requested_type <> 'internal_test' or requested_discount_type <> 'full' then
      raise exception '全項目を無料にできるのは内部テスト用の全額割引だけです' using errcode = '22023';
    end if;
    if requested_ends_at is null or requested_ends_at <= now() then
      raise exception '全項目無料の内部テストには有効期限が必要です' using errcode = '22023';
    end if;
    if not requested_one_per_account then
      raise exception '全項目無料の内部テストは1アカウント1回にしてください' using errcode = '22023';
    end if;
  end if;

  if nullif(input_campaign ->> 'id', '') is null then
    insert into public.discount_campaigns(
      name, campaign_type, product_code, discount_type, discount_value,
      discount_scope, starts_at, ends_at, max_redemptions, one_per_account,
      status, partner_name, partner_reference, created_by
    ) values (
      btrim(input_campaign ->> 'name'), requested_type,
      coalesce(input_campaign ->> 'product_code', 'self_book_v1'),
      requested_discount_type, (input_campaign ->> 'discount_value')::numeric,
      requested_scope, nullif(input_campaign ->> 'starts_at', '')::timestamptz,
      requested_ends_at, nullif(input_campaign ->> 'max_redemptions', '')::integer,
      requested_one_per_account, coalesce(input_campaign ->> 'status', 'draft'),
      nullif(input_campaign ->> 'partner_name', ''),
      nullif(input_campaign ->> 'partner_reference', ''), auth.uid()
    ) returning * into campaign_row;
  else
    update public.discount_campaigns set
      name = btrim(input_campaign ->> 'name'),
      campaign_type = requested_type,
      discount_type = requested_discount_type,
      discount_value = (input_campaign ->> 'discount_value')::numeric,
      discount_scope = requested_scope,
      starts_at = nullif(input_campaign ->> 'starts_at', '')::timestamptz,
      ends_at = requested_ends_at,
      max_redemptions = nullif(input_campaign ->> 'max_redemptions', '')::integer,
      one_per_account = requested_one_per_account,
      status = coalesce(input_campaign ->> 'status', status),
      partner_name = nullif(input_campaign ->> 'partner_name', ''),
      partner_reference = nullif(input_campaign ->> 'partner_reference', ''),
      stripe_coupon_id = null,
      stripe_mode = null
    where id = (input_campaign ->> 'id')::uuid
    returning * into campaign_row;
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
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  generated jsonb := '[]'::jsonb;
  code_value text;
  code_row public.discount_codes%rowtype;
  campaign_row public.discount_campaigns%rowtype;
  i integer;
begin
  if not public.is_admin_sales_mode_active() then
    raise exception '販売管理モードが必要です' using errcode = '42501';
  end if;
  if input_quantity < 1 or input_quantity > 1000 then
    raise exception '発行数は1〜1000件です';
  end if;

  select * into campaign_row
  from public.discount_campaigns
  where id = input_campaign_id;
  if campaign_row.id is null then
    raise exception 'キャンペーンが見つかりません' using errcode = 'P0002';
  end if;

  if campaign_row.discount_scope = 'entire_order' then
    if input_max_redemptions <> 1 then
      raise exception '全項目無料のテストコードは1回だけ利用できます' using errcode = '22023';
    end if;
    if input_expires_at is null or input_expires_at <= now() then
      raise exception '全項目無料のテストコードには有効期限が必要です' using errcode = '22023';
    end if;
    if campaign_row.ends_at is not null and input_expires_at > campaign_row.ends_at then
      raise exception 'コードの有効期限はキャンペーンの終了日時以内にしてください' using errcode = '22023';
    end if;
  end if;

  for i in 1..input_quantity loop
    code_value := case
      when input_common_code is not null then public.normalize_discount_code(input_common_code)
      else public.normalize_discount_code(input_prefix)
        || upper(substr(md5(random()::text || clock_timestamp()::text || i::text), 1, 12))
    end;
    insert into public.discount_codes(
      campaign_id, code, normalized_code, max_redemptions, expires_at
    ) values (
      input_campaign_id, code_value, code_value, input_max_redemptions, input_expires_at
    ) returning * into code_row;
    generated := generated || jsonb_build_array(to_jsonb(code_row));
  end loop;

  return generated;
end;
$$;

comment on column public.discount_campaigns.discount_scope is
  'base_product discounts the basic plan only; entire_order is a guarded internal-test waiver for every paid line in the order.';

commit;
