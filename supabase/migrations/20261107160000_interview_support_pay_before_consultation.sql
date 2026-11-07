-- Allow interview support payment before a separate consultation is submitted.
-- A supplied legacy consultation ID is still validated against the purchaser and selection.
-- No existing order, consultation, or contract rows are modified.
-- Keep these service-role-only functions' current signatures and privileges.

create or replace function public.get_commerce_v2_quote(
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
  if input_production_method = 'interview_staff' and input_consultation_id is not null then
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
      then
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
