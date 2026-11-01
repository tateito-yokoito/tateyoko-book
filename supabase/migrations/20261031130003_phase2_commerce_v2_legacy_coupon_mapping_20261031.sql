-- Carry the active legacy coupons to both new editions. Verify the current
-- production set before applying: a seventh test coupon was added on 2026-10-29.
-- Kept separate from the schema migration so isolated databases without live
-- coupon data can validate the catalog and checkout contract independently.
begin;
do $$
declare campaign_count integer; code_count integer;
begin
  select count(distinct c.id), count(dc.id)
    into campaign_count, code_count
  from public.discount_campaigns c
  join public.discount_codes dc on dc.campaign_id = c.id
  where c.product_code = 'self_book_v1'
    and c.status in ('active', 'scheduled') and dc.is_active = true;
  if campaign_count <> 7 or code_count <> 7 then
    raise exception 'Existing coupon set changed after approval; review V2 mappings before migrating';
  end if;
end;
$$;
insert into public.commerce_v2_campaign_products
  (campaign_id, edition, approved_at, approval_reference)
select distinct c.id, edition.value, now(),
  'Owner approved both V2 editions in Codex, 2026-10-29'
from public.discount_campaigns c
join public.discount_codes dc on dc.campaign_id = c.id
cross join (values ('standard'), ('premium')) as edition(value)
where c.product_code = 'self_book_v1'
  and c.status in ('active', 'scheduled') and dc.is_active = true;
commit;
