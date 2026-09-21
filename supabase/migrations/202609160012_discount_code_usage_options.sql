begin;

-- Preserve existing codes, campaign/account limits and sales-mode authorization.
-- NULL means unlimited across users, but newly issued unlimited codes must expire.
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
  if public.is_admin_sales_mode_active() is not true then
    raise exception '販売管理モードが必要です' using errcode = '42501';
  end if;
  if input_quantity is null or input_quantity < 1 or input_quantity > 1000 then
    raise exception '発行数は1〜1000件です' using errcode = '22023';
  end if;
  if input_common_code is not null and (input_quantity <> 1 or coalesce(public.normalize_discount_code(input_common_code), '') = '') then
    raise exception '共通コードを入力し、発行数は1件にしてください' using errcode = '22023';
  end if;
  if input_max_redemptions is not null and input_max_redemptions < 1 then
    raise exception '利用上限は1以上の整数で指定してください' using errcode = '22023';
  end if;

  select * into campaign_row from public.discount_campaigns where id = input_campaign_id;
  if campaign_row.id is null then
    raise exception 'キャンペーンが見つかりません' using errcode = 'P0002';
  end if;
  if (input_max_redemptions is null or campaign_row.discount_scope = 'entire_order') and input_expires_at is null then
    raise exception '無制限または全項目無料のコードには有効期限が必要です' using errcode = '22023';
  end if;
  if input_expires_at is not null and (not isfinite(input_expires_at) or input_expires_at <= now()) then
    raise exception '有効期限は未来の日時を指定してください' using errcode = '22023';
  end if;
  if campaign_row.discount_scope = 'entire_order' and campaign_row.ends_at is not null and input_expires_at > campaign_row.ends_at then
    raise exception 'コードの有効期限はキャンペーンの終了日時以内にしてください' using errcode = '22023';
  end if;

  for i in 1..input_quantity loop
    code_value := case when input_common_code is not null then public.normalize_discount_code(input_common_code)
      else public.normalize_discount_code(input_prefix)
        || upper(substr(md5(random()::text || clock_timestamp()::text || i::text), 1, 12)) end;
    insert into public.discount_codes(campaign_id, code, normalized_code, max_redemptions, expires_at)
      values (input_campaign_id, code_value, code_value, input_max_redemptions, input_expires_at)
      returning * into code_row;
    generated := generated || jsonb_build_array(to_jsonb(code_row));
  end loop;
  return generated;
end;
$$;

commit;
