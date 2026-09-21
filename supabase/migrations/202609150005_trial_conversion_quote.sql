begin;
-- Read-only quote for the new UI. Uses the existing invite qualification and
-- configured family discount, not a percentage inferred by the browser.
-- Does not create an order, reserve a discount, or modify a contract.
create function public.get_trial_conversion_quote(input_project_id uuid, input_order_type text, input_invitation_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare p public.book_projects%rowtype; i public.family_story_invitations%rowtype;
 q jsonb; percent integer := 0; reduction integer := 0;
begin
 if auth.uid() is null or input_order_type is null or input_order_type not in ('self','gift') then
   raise exception 'Authentication and purchase type required' using errcode='42501';
 end if;
 select * into p from public.book_projects where id=input_project_id;
 if p.id is null or p.owner_user_id is distinct from auth.uid() then
   raise exception 'Project owner required' using errcode='42501';
 end if;
 if input_order_type='self' and p.access_status in ('paid','gifted','legacy','refunded') then raise exception 'Review existing contract first'; end if;
 q := public.get_commerce_quote('self_book_v1',null,false);
 if input_invitation_id is not null then
   select * into i from public.family_story_invitations where id=input_invitation_id;
   if input_order_type <> 'self' or i.id is null or i.recipient_user_id is distinct from auth.uid()
      or i.recipient_project_id is distinct from p.id then
     raise exception 'Invitation does not belong to this recipient' using errcode='42501';
   end if;
   select coalesce(integer_value,0) into percent from public.commerce_settings where setting_key='family_invite_discount_percent';
   percent := least(100,greatest(0,coalesce(percent,0)));
   reduction := round(coalesce((q->>'amount_subtotal')::numeric,0)*percent/100);
 end if;
 return q || jsonb_build_object('amount_total',greatest(0,(q->>'amount_total')::integer-reduction),
  'family_price',reduction>0,'guarantee_days',case when input_order_type='gift' then 45 else 30 end);
end; $$;
revoke all on function public.get_trial_conversion_quote(uuid,text,uuid) from public,anon;
grant execute on function public.get_trial_conversion_quote(uuid,text,uuid) to authenticated;
create function public.get_trial_continuation_intent(input_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
begin
 if not public.can_confirm_experience_intent(input_project_id) then
   raise exception 'Project access required' using errcode='42501';
 end if;
 return (select jsonb_build_object('decision',decision) from public.family_trial_intents where book_project_id=input_project_id);
end; $$;
revoke all on function public.get_trial_continuation_intent(uuid) from public,anon;
grant execute on function public.get_trial_continuation_intent(uuid) to authenticated;
commit;
