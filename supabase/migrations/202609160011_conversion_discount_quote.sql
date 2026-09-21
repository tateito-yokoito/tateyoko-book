begin;
-- Read-only quote for the confirmation screen. Existing invitation/person
-- authorization remains authoritative; a quote never reserves a discount.
create function public.get_trial_conversion_order_quote(
 input_project_id uuid,input_order_type text,input_invitation_id uuid default null,
 input_discount_code text default null
) returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare base jsonb; q jsonb; reduction integer; scope text;
begin
 base:=get_trial_conversion_quote(input_project_id,input_order_type,input_invitation_id);
 q:=get_commerce_quote('self_book_v1',input_discount_code,false);
 if q->>'campaign_id' is not null then
  select discount_scope into scope from discount_campaigns where id=(q->>'campaign_id')::uuid;
  if scope='entire_order' then
   q:=q||jsonb_build_object('amount_total',0,'discount_amount',(q->>'amount_subtotal')::integer);
  end if;
 end if;
 reduction:=least(greatest(0,(q->>'amount_total')::integer),
  greatest(0,(base->>'amount_subtotal')::integer-(base->>'amount_total')::integer));
 return q||jsonb_build_object('amount_total',greatest(0,(q->>'amount_total')::integer-reduction),
  'family_price',base->'family_price','family_discount_amount',reduction,
  'guarantee_days',base->'guarantee_days');
end; $$;
revoke all on function public.get_trial_conversion_order_quote(uuid,text,uuid,text) from public,anon;
grant execute on function public.get_trial_conversion_order_quote(uuid,text,uuid,text) to authenticated;
commit;
