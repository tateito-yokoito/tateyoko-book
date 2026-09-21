begin;
alter table public.family_story_invitations add column pricing_policy_version text
 check(pricing_policy_version is null or pricing_policy_version='2.0');

-- New pre-purchase trials do not silently become paid-family referrals.
-- Old invitations retain the prices already offered under the old policy.
create function public.create_conversion_trial_invitation(
 input_project_id uuid,input_recipient_name text,input_recipient_email text,
 input_relationship_label text,input_assistance_mode text,input_message_template text,
 input_personal_message text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from book_projects where id=input_project_id and owner_user_id=auth.uid()) then
  raise exception 'Project owner required' using errcode='42501';
 end if;
 result:=create_family_story_invitation(input_recipient_name,input_recipient_email,input_relationship_label,
  input_assistance_mode,'trial_gift','email',input_message_template,input_personal_message,'{}'::jsonb);
 update family_story_invitations set pricing_policy_version='2.0' where id=(result->>'id')::uuid;
 return result||jsonb_build_object('pricing_policy_version','2.0');
end; $$;
revoke all on function public.create_conversion_trial_invitation(uuid,text,text,text,text,text,text) from public,anon;
grant execute on function public.create_conversion_trial_invitation(uuid,text,text,text,text,text,text) to authenticated;

create function public.get_conversion_invitation_discount(input_invitation_id uuid)
returns integer language plpgsql stable security definer set search_path=public,auth as $$
declare i family_story_invitations%rowtype; percent integer;
begin
 select * into i from family_story_invitations where id=input_invitation_id;
 if i.id is null or (coalesce(auth.role(),'')<>'service_role'
    and (auth.uid() is null or (i.inviter_user_id is distinct from auth.uid() and i.recipient_user_id is distinct from auth.uid()))) then
  raise exception 'Invitation access required' using errcode='42501';
 end if;
 if i.pricing_policy_version='2.0' and not exists(
  select 1 from book_projects p where p.owner_user_id=i.inviter_user_id
   and p.access_status in ('paid','gifted','legacy')
   and not exists(select 1 from experience_contracts c join experience_refund_requests r on r.order_id=c.order_id where c.book_project_id=p.id)
 ) then return 0; end if;
 select integer_value into percent from commerce_settings where setting_key='family_invite_discount_percent';
 return least(100,greatest(0,coalesce(percent,0)));
end; $$;
revoke all on function public.get_conversion_invitation_discount(uuid) from public,anon;
grant execute on function public.get_conversion_invitation_discount(uuid) to authenticated,service_role;

create or replace function public.get_trial_conversion_quote(input_project_id uuid,input_order_type text,input_invitation_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare p book_projects%rowtype; i family_story_invitations%rowtype; q jsonb; percent integer:=0; reduction integer:=0;
begin
 if auth.uid() is null or input_order_type is null or input_order_type not in ('self','gift') then
  raise exception 'Authentication and purchase type required' using errcode='42501'; end if;
 select * into p from book_projects where id=input_project_id;
 if p.id is null or p.owner_user_id is distinct from auth.uid() then
  raise exception 'Project owner required' using errcode='42501'; end if;
 if input_order_type='self' and p.access_status in ('paid','gifted','legacy','refunded') then raise exception 'Review existing contract first'; end if;
 q:=get_commerce_quote('self_book_v1',null,false);
 if input_invitation_id is not null then
  select * into i from family_story_invitations where id=input_invitation_id;
  if i.id is null or not coalesce((
    (input_order_type='self' and i.recipient_user_id=auth.uid() and i.recipient_project_id=p.id)
    or (input_order_type='gift' and i.inviter_user_id=auth.uid() and i.status in ('awaiting_payment','continuation_awaiting_payment'))
  ),false) then raise exception 'Invitation does not belong to this purchase' using errcode='42501'; end if;
  percent:=get_conversion_invitation_discount(i.id);
  reduction:=round(coalesce((q->>'amount_subtotal')::numeric,0)*percent/100);
 end if;
 return q||jsonb_build_object('amount_total',greatest(0,(q->>'amount_total')::integer-reduction),
  'family_price',reduction>0,'guarantee_days',case when input_order_type='gift' then 45 else 30 end);
end; $$;
commit;
