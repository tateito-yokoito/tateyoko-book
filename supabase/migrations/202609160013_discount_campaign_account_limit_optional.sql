begin;

-- Account restriction is configurable; existing campaign values are unchanged.
alter table public.discount_campaigns drop constraint discount_campaigns_entire_order_test_check;
alter table public.discount_campaigns add constraint discount_campaigns_entire_order_test_check check (
  discount_scope <> 'entire_order' or (
    campaign_type = 'internal_test' and discount_type = 'full'
    and discount_value = 100 and ends_at is not null
  )
);

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
  if public.is_admin_sales_mode_active() is not true then
    raise exception '販売管理モードが必要です' using errcode = '42501';
  end if;

  if requested_scope = 'entire_order' then
    if requested_type <> 'internal_test' or requested_discount_type <> 'full' then
      raise exception '全項目を無料にできるのは内部テスト用の全額割引だけです' using errcode = '22023';
    end if;
    if requested_ends_at is null or requested_ends_at <= now() then
      raise exception '全項目無料の内部テストには有効期限が必要です' using errcode = '22023';
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
commit;
