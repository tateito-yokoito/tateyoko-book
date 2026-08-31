begin;

create or replace function public.get_admin_commerce_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'products', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.product_code), '[]'::jsonb)
      from public.commerce_products p
    ),
    'campaigns', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
      from public.discount_campaigns c
    ),
    'codes', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
      from public.discount_codes c
    ),
    'orders', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
      from (
        select
          o.*,
          coalesce(
            o.purchaser_name_snapshot,
            nullif(btrim(concat_ws(' ', p.family_name, p.given_name)), ''),
            p.display_name,
            u.email
          ) as purchaser_name,
          coalesce(o.purchaser_email_snapshot, u.email) as purchaser_email,
          dc.code as discount_code,
          d.name as campaign_name,
          concat_ws(' ＋ ',
            case when o.includes_base_book then '基本パッケージ（スタンダード冊子1冊）' end,
            case when o.standard_extra_copy_count > 0 then 'スタンダード冊子 増刷' || o.standard_extra_copy_count || '冊' end,
            case when o.premium_copy_count > 0 then 'プレミアム冊子 ' || o.premium_copy_count || '冊' end,
            case when o.gift_package_selected then 'ギフトパッケージ' end
          ) as item_summary
        from public.commerce_orders o
        left join auth.users u on u.id = o.purchaser_user_id
        left join public.profiles p on p.id = o.purchaser_user_id
        left join public.discount_codes dc on dc.id = o.discount_code_id
        left join public.discount_campaigns d on d.id = dc.campaign_id
        order by o.created_at desc
        limit 500
      ) x
    ),
    'gifts', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
      from (
        select
          g.*,
          o.order_number,
          o.purchaser_user_id,
          o.amount_total,
          o.status as order_status
        from public.gift_orders g
        join public.commerce_orders o on o.id = g.commerce_order_id
        where o.status in ('paid', 'zero_paid')
        order by g.created_at desc
        limit 500
      ) x
    )
  ) into result;

  return result;
end;
$$;

commit;
