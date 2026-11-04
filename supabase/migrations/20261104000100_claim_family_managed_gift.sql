-- Gift B uses the existing gift payment and child-led project creation.
-- Keep the consent check and claim in one transaction so a failed claim leaves
-- the newly created project unpaid and retryable with its creation key.
create or replace function public.claim_family_managed_gift(
  input_claim_token text,
  input_book_project_id uuid,
  input_subject_consent boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_gift public.gift_orders%rowtype;
  target_order public.commerce_orders%rowtype;
  target_project public.book_projects%rowtype;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;
  if input_subject_consent is distinct from true then
    raise exception 'ご本人の了承を確認してください' using errcode = '22023';
  end if;

  select * into target_gift from public.gift_orders
  where claim_token = input_claim_token for update;
  if target_gift.id is null then
    raise exception 'ギフトが見つかりません' using errcode = 'P0002';
  end if;
  select * into target_order from public.commerce_orders
  where id = target_gift.commerce_order_id;
  if target_order.order_type <> 'gift'
    or target_order.purchaser_user_id <> auth.uid()
    or target_order.status not in ('paid', 'zero_paid') then
    raise exception '購入内容を確認できませんでした' using errcode = '42501';
  end if;
  if target_gift.claimed_at is not null then
    if target_gift.claimed_by_user_id = auth.uid()
      and target_gift.recipient_project_id = input_book_project_id then
      return jsonb_build_object('success', true, 'project_id', input_book_project_id,
        'order_id', target_order.id, 'already_claimed', true);
    end if;
    raise exception 'このギフトは受取済みです' using errcode = '22023';
  end if;

  select * into target_project from public.book_projects
  where id = input_book_project_id for update;
  if target_project.id is null
    or target_project.owner_user_id <> auth.uid()
    or target_project.onboarding_preferences ->> 'support_mode' <> 'child_led'
    or target_project.commerce_order_id is not null
    or target_project.purchased_at is not null
    or coalesce(target_project.access_status, '') in ('paid', 'gifted', 'legacy')
    or exists (select 1 from public.user_person_links upl
      where upl.user_id = auth.uid() and upl.person_id = target_project.subject_person_id
        and upl.role = 'self') then
    raise exception '対象の物語を確認できませんでした' using errcode = '42501';
  end if;

  update public.book_projects set onboarding_preferences =
    coalesce(onboarding_preferences, '{}'::jsonb) || jsonb_build_object(
      'gift_mode', 'family_managed',
      'subject_consent_confirmed_by', auth.uid(),
      'subject_consent_confirmed_at', now())
  where id = input_book_project_id;

  return public.claim_gift_order(input_claim_token, input_book_project_id);
end;
$$;

revoke all on function public.claim_family_managed_gift(text, uuid, boolean) from public, anon;
grant execute on function public.claim_family_managed_gift(text, uuid, boolean) to authenticated;
