-- A gift may be attached only to an unpurchased project owned by the recipient.
-- A repeated claim of the same gift/project remains idempotent.
create or replace function public.claim_gift_order(input_claim_token text, input_book_project_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, auth as $$
declare
  gift_row public.gift_orders%rowtype;
  order_row public.commerce_orders%rowtype;
  project_row public.book_projects%rowtype;
begin
  if auth.uid() is null then raise exception 'ログインが必要です' using errcode='42501'; end if;
  select * into gift_row from public.gift_orders
    where claim_token=input_claim_token for update;
  if gift_row.id is null then raise exception 'ギフトが見つかりません' using errcode='P0002'; end if;
  select * into order_row from public.commerce_orders where id=gift_row.commerce_order_id;
  if order_row.status not in ('paid','zero_paid') then
    raise exception 'このギフトはまだ利用できません' using errcode='22023'; end if;
  if gift_row.claimed_by_user_id is not null then
    if gift_row.claimed_by_user_id<>auth.uid()
      or gift_row.recipient_project_id is distinct from input_book_project_id then
      raise exception 'このギフトは受取済みです' using errcode='22023';
    end if;
    return jsonb_build_object('success',true,'project_id',input_book_project_id,
      'order_id',order_row.id);
  end if;
  select * into project_row from public.book_projects
    where id=input_book_project_id and owner_user_id=auth.uid() and status='active'
    for update;
  if project_row.id is null then raise exception '物語を確認できません' using errcode='42501'; end if;
  if project_row.access_status<>'trial' or project_row.commerce_order_id is not null
    or project_row.purchased_at is not null or order_row.book_project_id is not null then
    raise exception '購入済みの物語には受け取れません' using errcode='22023';
  end if;

  perform set_config('app.payment_flow','on',true);
  update public.book_projects set access_status='gifted',
    purchaser_user_id=order_row.purchaser_user_id,
    purchased_at=order_row.purchased_at,commerce_order_id=order_row.id
    where id=input_book_project_id;
  update public.commerce_orders set book_project_id=input_book_project_id
    where id=order_row.id;
  update public.gift_orders set claimed_by_user_id=auth.uid(),
    claimed_at=coalesce(claimed_at,now()),recipient_project_id=input_book_project_id
    where id=gift_row.id;
  return jsonb_build_object('success',true,'project_id',input_book_project_id,
    'order_id',order_row.id);
end;
$$;

revoke all on function public.claim_gift_order(text,uuid) from public,anon;
grant execute on function public.claim_gift_order(text,uuid) to authenticated;
