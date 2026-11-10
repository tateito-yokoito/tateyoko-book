-- Initial BOOK completion for an already purchased V2 story. This is separate
-- from the existing post-completion reprint order, but uses the same catalog,
-- commerce_orders, immutable order snapshot, and paid-order production trigger.
begin;

-- Publication notices are claimed once, after the approved Web book is live.
-- Existing published cases remain NULL, so deployment never sends old notices.
alter table public.book_ops_cases
  add column publication_notice_state text
    check (publication_notice_state in ('pending','sending','sent','unavailable','failed')),
  add column publication_notice_attempted_at timestamptz,
  add column publication_notice_sent_at timestamptz,
  add column publication_notice_channel text,
  add column publication_notice_error text;
update public.book_ops_cases c set publication_notice_state='pending'
where not exists (select 1 from public.voice_publications p
  where p.book_project_id=c.book_project_id and p.status='published');
alter table public.book_ops_cases
  alter column publication_notice_state set default 'pending';

-- V2 permits one additional standard copy. Legacy quote functions still
-- enforce their existing two-copy minimum; no existing order is changed.
alter table public.book_cover_settings
  drop constraint if exists book_cover_settings_standard_extra_copy_count_check;
alter table public.book_cover_settings
  add constraint book_cover_settings_standard_extra_copy_count_check
  check (standard_extra_copy_count between 0 and 30);
alter table public.book_projects
  drop constraint if exists book_projects_ordered_standard_extra_copy_count_check;
alter table public.book_projects
  add constraint book_projects_ordered_standard_extra_copy_count_check
  check (ordered_standard_extra_copy_count between 0 and 30);
alter table public.commerce_orders
  drop constraint if exists commerce_orders_requested_standard_extra_copy_count_check;
alter table public.commerce_orders
  add constraint commerce_orders_requested_standard_extra_copy_count_check
  check (requested_standard_extra_copy_count between 0 and 30);

-- An expired attempt may be retried, but only one active or settled first
-- completion order can exist for a story, even under concurrent requests.
create unique index commerce_v2_one_initial_completion_per_project
  on public.commerce_orders(book_project_id)
  where metadata->>'order_kind'='initial_completion'
    and status in ('checkout_pending','paid','zero_paid');

create function public.can_complete_v2_book(input_project_id uuid, input_actor_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select input_actor_id is not null and exists (
    select 1 from public.book_projects p
    join public.book_work_manifests w on w.book_project_id=p.id
    where p.id=input_project_id and p.status='active'
      and p.purchased_edition_v2 in ('standard','premium')
      and p.access_status in ('paid','zero_paid','gifted')
      and w.confirmed_at is null
      and exists (
        select 1 from public.commerce_orders base
        where base.book_project_id=p.id and base.pricing_version='v2'
          and base.includes_base_book and base.status in ('paid','zero_paid')
      )
      and (p.owner_user_id=input_actor_id or exists (
        select 1 from public.project_supporters ps
        where ps.book_project_id=p.id and ps.supporter_user_id=input_actor_id
          and ps.status='active' and ps.can_build_book
          and ps.meta_json->>'support_role' in ('facilitator','co_manager')
      ))
  );
$$;
revoke all on function public.can_complete_v2_book(uuid,uuid) from public,anon,authenticated;
grant execute on function public.can_complete_v2_book(uuid,uuid) to service_role;

create function public.get_commerce_v2_completion_quote(
  input_project_id uuid, input_actor_id uuid,
  input_standard_count integer, input_premium_count integer
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  p public.book_projects%rowtype;
  standard_product public.commerce_products%rowtype;
  premium_product public.commerce_products%rowtype;
  lines jsonb := '[]'::jsonb;
  subtotal integer;
begin
  if public.can_complete_v2_book(input_project_id,input_actor_id) is distinct from true then
    raise exception 'この作品は完成できません' using errcode='42501';
  end if;
  if input_standard_count is null or input_premium_count is null
    or input_standard_count not between 0 and 30 or input_premium_count not between 0 and 30 then
    raise exception '追加冊子の冊数を確認してください' using errcode='22023';
  end if;
  select * into p from public.book_projects where id=input_project_id;
  select * into standard_product from public.commerce_products
    where product_code='standard_extra_v2' and is_active;
  select * into premium_product from public.commerce_products
    where product_code='premium_extra_v2' and is_active;
  if (input_standard_count>0 and (standard_product.product_code is null
       or standard_product.currency<>'jpy' or not standard_product.tax_included))
    or (input_premium_count>0 and (premium_product.product_code is null
       or premium_product.currency<>'jpy' or not premium_product.tax_included)) then
    raise exception '販売商品を確認できません' using errcode='P0002';
  end if;
  subtotal:=input_standard_count*coalesce(standard_product.amount_jpy,0)
    + input_premium_count*coalesce(premium_product.amount_jpy,0);
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_code',product_code,'quantity',quantity,
    'unit_amount_jpy',unit_amount_jpy,'line_amount_jpy',quantity*unit_amount_jpy
  ) order by ordinal),'[]'::jsonb) into lines
  from (values
    (1,'standard_extra_v2',input_standard_count,coalesce(standard_product.amount_jpy,0)),
    (2,'premium_extra_v2',input_premium_count,coalesce(premium_product.amount_jpy,0))
  ) item(ordinal,product_code,quantity,unit_amount_jpy) where quantity>0;
  return jsonb_build_object(
    'pricing_version','v2','order_kind','initial_completion',
    'edition',p.purchased_edition_v2,'production_method',p.production_method_v2,
    'standard_extra_count',input_standard_count,'premium_extra_count',input_premium_count,
    'lines',lines,'amount_subtotal',subtotal,'discount_amount',0,
    'amount_total',subtotal,'currency','jpy','tax_included',true
  );
end; $$;
revoke all on function public.get_commerce_v2_completion_quote(uuid,uuid,integer,integer)
  from public,anon,authenticated;
grant execute on function public.get_commerce_v2_completion_quote(uuid,uuid,integer,integer)
  to service_role;

create function public.create_commerce_v2_completion_order(
  input_project_id uuid, input_actor_id uuid,
  input_standard_count integer, input_premium_count integer,
  input_request_key uuid, input_expected_quote jsonb,
  input_shipping_address jsonb, input_design_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  p public.book_projects%rowtype;
  cover public.book_cover_settings%rowtype;
  quote jsonb;
  o public.commerce_orders%rowtype;
  item jsonb;
begin
  if input_request_key is null or input_shipping_address is null
    or jsonb_typeof(input_shipping_address)<>'object'
    or exists (select 1 from (values ('recipient_name'),('postal_code'),
      ('prefecture'),('city'),('line1')) required(field)
      where length(btrim(coalesce(input_shipping_address->>field,''))) not between 1 and 200)
    or input_design_snapshot is null or jsonb_typeof(input_design_snapshot)<>'object' then
    raise exception 'お届け先・表紙を確認してください' using errcode='22023';
  end if;
  select * into p from public.book_projects where id=input_project_id for update;
  select * into cover from public.book_cover_settings
    where book_project_id=input_project_id for update;
  if cover.book_project_id is null
    or to_jsonb(cover) - 'updated_at' is distinct from input_design_snapshot
    or cover.shipping_address is distinct from input_shipping_address
    or cover.standard_extra_copy_count is distinct from
      coalesce(p.ordered_standard_extra_copy_count,0)+input_standard_count
    or cover.premium_copy_count is distinct from
      coalesce(p.ordered_premium_copy_count,0)+input_premium_count then
    raise exception '表紙・冊子・お届け先の保存内容が一致しません' using errcode='22023';
  end if;
  select * into o from public.commerce_orders where request_key_v2=input_request_key for update;
  if o.id is not null then
    if o.book_project_id is distinct from input_project_id
      or o.purchaser_user_id is distinct from input_actor_id
      or o.quote_snapshot_v2 is distinct from input_expected_quote
      or o.shipping_address is distinct from input_shipping_address
      or o.design_snapshot is distinct from input_design_snapshot
      or o.metadata->>'order_kind' is distinct from 'initial_completion' then
      raise exception '再試行の内容が一致しません' using errcode='22023';
    end if;
    return jsonb_build_object('order',to_jsonb(o),'quote',o.quote_snapshot_v2,'reused',true);
  end if;
  if public.can_complete_v2_book(input_project_id,input_actor_id) is distinct from true then
    raise exception 'この作品は完成できません' using errcode='42501';
  end if;
  quote:=public.get_commerce_v2_completion_quote(input_project_id,input_actor_id,
    input_standard_count,input_premium_count);
  if quote is distinct from input_expected_quote then
    raise exception '見積が変更されました' using errcode='22023';
  end if;
  select * into o from public.commerce_orders pending
    where pending.book_project_id=input_project_id
      and pending.metadata->>'order_kind'='initial_completion'
      and pending.status='checkout_pending' for update;
  if o.id is not null then
    if o.purchaser_user_id=input_actor_id and o.quote_snapshot_v2=quote
      and o.shipping_address=input_shipping_address and o.design_snapshot=input_design_snapshot then
      return jsonb_build_object('order',to_jsonb(o),'quote',quote,'reused',true);
    end if;
    raise exception '進行中の完成決済を先に確認してください' using errcode='22023';
  end if;
  insert into public.commerce_orders (
    purchaser_user_id,book_project_id,order_type,product_code,
    amount_subtotal,discount_amount,amount_total,currency,status,
    includes_base_book,base_book_amount,standard_extra_copy_count,premium_copy_count,
    requested_standard_extra_copy_count,requested_premium_copy_count,
    gift_package_selected,shipping_address,design_snapshot,
    edition_v2,production_method_v2,pricing_version,request_key_v2,quote_snapshot_v2,metadata
  ) values (
    input_actor_id,input_project_id,'self',
    case when input_standard_count>0 then 'standard_extra_v2'
      when input_premium_count>0 then 'premium_extra_v2'
      when p.purchased_edition_v2='premium' then 'premium_bundle_v2'
      else 'standard_bundle_v2' end,
    (quote->>'amount_subtotal')::integer,0,(quote->>'amount_total')::integer,
    'jpy','checkout_pending',false,0,input_standard_count,input_premium_count,
    coalesce(p.ordered_standard_extra_copy_count,0)+input_standard_count,
    coalesce(p.ordered_premium_copy_count,0)+input_premium_count,
    false,input_shipping_address,input_design_snapshot,
    p.purchased_edition_v2,p.production_method_v2,'v2',input_request_key,quote,
    jsonb_build_object('order_kind','initial_completion')
  ) returning * into o;
  for item in select * from jsonb_array_elements(quote->'lines') loop
    insert into public.commerce_v2_order_items(order_id,product_code,quantity,unit_amount_jpy)
    values(o.id,item->>'product_code',(item->>'quantity')::integer,
      (item->>'unit_amount_jpy')::integer);
  end loop;
  return jsonb_build_object('order',to_jsonb(o),'quote',quote,'reused',false);
end; $$;
revoke all on function public.create_commerce_v2_completion_order(uuid,uuid,integer,integer,uuid,jsonb,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.create_commerce_v2_completion_order(uuid,uuid,integer,integer,uuid,jsonb,jsonb,jsonb)
  to service_role;

-- Freeze the source only while this particular first-completion checkout is
-- pending. A cancelled or expired session releases editing; a paid session
-- moves to the existing immutable BOOK manifest in the same transaction.
create function public.guard_pending_v2_completion_edit()
returns trigger language plpgsql security definer set search_path=public as $$
declare project_id uuid;
begin
  if tg_op='DELETE' then
    project_id:=old.book_project_id;
  else
    project_id:=new.book_project_id;
  end if;
  if tg_op='UPDATE' and old.book_project_id is distinct from new.book_project_id
    and exists (select 1 from public.commerce_orders o
      where o.book_project_id=old.book_project_id and o.status='checkout_pending'
        and o.metadata->>'order_kind'='initial_completion') then
    raise exception '完成決済中は作品を変更できません。決済を完了するか中止してください'
      using errcode='55000';
  end if;
  -- Serialize source edits with completion-order creation.
  perform 1 from public.book_projects where id=project_id for share;
  if project_id is not null and exists (
    select 1 from public.commerce_orders o
    where o.book_project_id=project_id and o.status='checkout_pending'
      and o.metadata->>'order_kind'='initial_completion'
  ) then
    raise exception '完成決済中は作品を変更できません。決済を完了するか中止してください'
      using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public.guard_pending_v2_completion_edit() from public,anon,authenticated;

-- The legacy finalizer cannot be used as a second path to complete a V2 BOOK.
create function public.guard_v2_completion_order_payment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.metadata->>'order_kind'='initial_completion'
    and old.status not in ('paid','zero_paid') and new.status in ('paid','zero_paid')
    and current_setting('app.v2_completion_finalizing',true) is distinct from 'on' then
    raise exception 'BOOK完成注文は専用の確定処理が必要です' using errcode='42501';
  end if;
  return new;
end; $$;
revoke all on function public.guard_v2_completion_order_payment() from public,anon,authenticated;
create trigger guard_v2_completion_order_payment before update of status on public.commerce_orders
  for each row execute function public.guard_v2_completion_order_payment();
create trigger guard_completion_answers before insert or update or delete on public.answers
  for each row execute function public.guard_pending_v2_completion_edit();
create trigger guard_completion_questions before insert or update or delete on public.user_questions
  for each row execute function public.guard_pending_v2_completion_edit();
create trigger guard_completion_media before insert or update or delete on public.media_assets
  for each row execute function public.guard_pending_v2_completion_edit();
create trigger guard_completion_videos before insert or update or delete on public.video_stories
  for each row execute function public.guard_pending_v2_completion_edit();
create trigger guard_completion_cover before insert or update or delete on public.book_cover_settings
  for each row execute function public.guard_pending_v2_completion_edit();
create trigger guard_completion_selection before insert or update or delete on public.book_work_manifests
  for each row execute function public.guard_pending_v2_completion_edit();

-- The old direct-confirm RPC must not become a second V2 completion route.
-- The paid-order trigger is the only route that may set confirmed_at for a
-- newly completed V2 BOOK; legacy and already confirmed BOOKs are unaffected.
create function public.guard_v2_book_confirmation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.confirmed_at is null and new.confirmed_at is not null
    and exists (select 1 from public.book_projects p where p.id=new.book_project_id
      and p.purchased_edition_v2 in ('standard','premium'))
    and not exists (
      select 1 from public.commerce_orders o
      join public.book_order_work_snapshots s on s.order_id=o.id
      where o.book_project_id=new.book_project_id
        and o.metadata->>'order_kind'='initial_completion'
        and o.status in ('paid','zero_paid')
        and s.work_manifest_id=new.id
        and s.snapshot=new.snapshot
    ) then
    raise exception 'BOOK完成には追加注文とお届け先の確定が必要です'
      using errcode='42501';
  end if;
  return new;
end; $$;
revoke all on function public.guard_v2_book_confirmation() from public,anon,authenticated;
create trigger guard_v2_book_confirmation before update of confirmed_at on public.book_work_manifests
  for each row execute function public.guard_v2_book_confirmation();

create function public.finalize_commerce_v2_completion_order(
  input_order_id uuid,input_checkout_session_id text,input_customer_id text,
  input_payment_intent_id text,input_payment_status text,input_amount_total integer,
  input_stripe_mode text,input_purchased_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.commerce_orders%rowtype; prepared public.book_order_work_snapshots%rowtype;
  result jsonb;
begin
  select * into o from public.commerce_orders where id=input_order_id for update;
  if o.id is null or o.metadata->>'order_kind' is distinct from 'initial_completion'
    or o.includes_base_book or o.amount_total is distinct from input_amount_total then
    raise exception '完成注文が一致しません' using errcode='22023';
  end if;
  if o.status in ('paid','zero_paid') then
    if o.stripe_checkout_session_id is distinct from input_checkout_session_id
      or (o.status='paid' and input_payment_status<>'paid') then
      raise exception '決済情報が一致しません' using errcode='22023';
    end if;
    return jsonb_build_object('order',to_jsonb(o),'gift',null);
  end if;
  if o.status<>'checkout_pending' or
    (o.amount_total=0 and (input_payment_status<>'no_payment_required' or input_checkout_session_id is not null)) or
    (o.amount_total>0 and (input_payment_status<>'paid' or input_checkout_session_id is distinct from o.stripe_checkout_session_id)) then
    raise exception '決済状況が一致しません' using errcode='22023';
  end if;
  select * into prepared from public.book_order_work_snapshots where order_id=o.id;
  if prepared.order_id is null then raise exception '完成原本が準備されていません' using errcode='22023'; end if;
  perform set_config('app.v2_completion_finalizing','on',true);
  result:=public.finalize_commerce_order(input_order_id,input_checkout_session_id,
    input_customer_id,input_payment_intent_id,input_payment_status,input_amount_total,
    input_stripe_mode,input_purchased_at);
  if not exists (select 1 from public.book_production_jobs j
    where j.order_id=o.id and j.source_sha256=prepared.source_sha256 and j.stage<>'snapshot_conflict') then
    raise exception '完成原本と制作ジョブが一致しません' using errcode='22023';
  end if;
  return result;
end; $$;
revoke all on function public.finalize_commerce_v2_completion_order(uuid,text,text,text,text,integer,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.finalize_commerce_v2_completion_order(uuid,text,text,text,text,integer,text,timestamptz)
  to service_role;

-- The bookshelf uses its existing publication cards for both states. Pending
-- rows carry no public ID, so a private preview can never be opened as a
-- published Web book. This RPC returns only the caller's authorized stories.
create function public.list_pending_book_library()
returns table (
  publication_id text, public_id text, book_project_id uuid,
  title text, subtitle text, subject_name text, subject_person_id uuid,
  published_at timestamptz, access_mode text, relationship text, is_self boolean,
  completion_pending boolean
) language sql stable security definer set search_path=public,auth as $$
  select 'pending:' || p.id::text, null::text, p.id,
    coalesce(nullif(w.snapshot->'cover'->>'title',''),'わたしの物語'),
    coalesce(w.snapshot->'cover'->>'subtitle',''),
    coalesce(nullif(person.preferred_name,''),nullif(person.display_name,''),'名前未設定'),
    p.subject_person_id,w.confirmed_at,null::text,
    case when p.owner_user_id=auth.uid() then 'owner' else 'managed' end,
    exists (select 1 from public.user_person_links upl
      where upl.user_id=auth.uid() and upl.person_id=p.subject_person_id
        and upl.role='self'), true
  from public.book_projects p
  join public.book_work_manifests w on w.book_project_id=p.id
  join public.commerce_orders o on o.book_project_id=p.id
    and o.metadata->>'order_kind'='initial_completion'
    and o.status in ('paid','zero_paid')
  left join public.persons person on person.id=p.subject_person_id
  where auth.uid() is not null and p.status='active' and w.confirmed_at is not null
    and (p.owner_user_id=auth.uid() or exists (
      select 1 from public.project_supporters ps
      where ps.book_project_id=p.id and ps.supporter_user_id=auth.uid()
        and ps.status='active' and ps.can_build_book))
    and not exists (select 1 from public.voice_publications pub
      where pub.book_project_id=p.id and pub.status='published');
$$;
revoke all on function public.list_pending_book_library() from public,anon;
grant execute on function public.list_pending_book_library() to authenticated;

commit;
