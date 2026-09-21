begin;

-- Additive rollout: no backfill and no change to the terms of existing orders.
-- Enrolment is service-only and must happen before creating a v2 Checkout.
create table public.experience_contracts (
  order_id uuid primary key references public.commerce_orders(id) on delete restrict,
  policy_version text not null default '2.0' check (policy_version = '2.0'),
  book_project_id uuid references public.book_projects(id) on delete restrict,
  subject_person_id uuid references public.persons(id) on delete restrict,
  purchaser_user_id uuid not null references auth.users(id) on delete restrict,
  purchase_kind text not null check (purchase_kind in ('self', 'gift')),
  guarantee_days integer not null check (guarantee_days in (30, 45)),
  base_paid_amount integer not null check (base_paid_amount >= 0),
  payment_confirmed_at timestamptz,
  guarantee_expires_at timestamptz,
  gift_activation_expires_at timestamptz,
  production_started_at timestamptz,
  production_expires_at timestamptz,
  main_experience_started_at timestamptz,
  main_started_by uuid references auth.users(id) on delete restrict,
  refund_confirmed_at timestamptz,
  export_available_until timestamptz,
  created_at timestamptz not null default now(),
  check ((purchase_kind = 'self' and guarantee_days = 30)
    or (purchase_kind = 'gift' and guarantee_days = 45)),
  check ((payment_confirmed_at is null) = (guarantee_expires_at is null)),
  check ((refund_confirmed_at is null) = (export_available_until is null))
);

-- A Person can have multiple works. Only one paid v2 contract per active work.
create unique index experience_contracts_active_project on public.experience_contracts(book_project_id)
  where payment_confirmed_at is not null and refund_confirmed_at is null;

create table public.experience_refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.experience_contracts(order_id) on delete restrict,
  subject_person_id uuid references public.persons(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  base_amount integer not null check (base_amount > 0),
  requested_amount integer not null check (requested_amount >= base_amount),
  status text not null default 'requested' check (status in ('requested', 'pending', 'failed', 'succeeded')),
  stripe_refund_id text unique,
  confirmed_at timestamptz,
  identity_review_required boolean not null default false,
  deletion_review_status text not null default 'not_due'
    check (deletion_review_status in ('not_due', 'review_required', 'retained', 'notified', 'resolved'))
);
-- A pending or failed processor request retains its eligibility and request ID.
-- Retrying it is not a second use of the guarantee.
create unique index experience_refund_once_per_person on public.experience_refund_requests(subject_person_id);

create table public.family_trial_intents (
  invitation_id uuid primary key references public.family_story_invitations(id) on delete restrict,
  intent_id uuid not null unique default gen_random_uuid(),
  book_project_id uuid not null references public.book_projects(id) on delete restrict,
  subject_person_id uuid not null references public.persons(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('continue', 'later')),
  subject_intent_confirmed boolean not null check (subject_intent_confirmed),
  decided_at timestamptz not null default now()
);

create table public.experience_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  kind text not null check (kind = 'family_continue_requested'),
  invitation_id uuid not null references public.family_story_invitations(id) on delete restrict,
  intent_id uuid not null,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.experience_contracts enable row level security;
alter table public.experience_refund_requests enable row level security;
alter table public.family_trial_intents enable row level security;
alter table public.experience_notification_outbox enable row level security;
revoke all on public.experience_contracts, public.experience_refund_requests,
  public.family_trial_intents, public.experience_notification_outbox from public, anon, authenticated;
grant all on public.experience_contracts, public.experience_refund_requests,
  public.family_trial_intents, public.experience_notification_outbox to service_role;

create function public.can_confirm_experience_intent(input_project_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.uid() is not null and exists (
    select 1 from public.book_projects p where p.id = input_project_id and p.status = 'active'
      and (p.owner_user_id = auth.uid() or exists (
        select 1 from public.project_supporters s
        where s.book_project_id = p.id and s.supporter_user_id = auth.uid()
          and s.status = 'active' and s.can_operate_recording = true
      ))
  );
$$;

create function public.register_experience_contract(input_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  o public.commerce_orders%rowtype;
  p public.book_projects%rowtype;
  c public.experience_contracts%rowtype;
  base_amount integer;
begin
  select * into o from public.commerce_orders where id = input_order_id for update;
  select * into c from public.experience_contracts where order_id = input_order_id;
  if c.order_id is not null then return to_jsonb(c); end if;
  if o.id is null or o.status <> 'checkout_pending' or o.order_type not in ('self', 'gift')
    or not o.includes_base_book then
    raise exception 'Only a new unpaid base-book order can adopt v2 terms';
  end if;
  -- Finish-time options use separate orders; don't guess mixed-order allocations.
  if coalesce(o.standard_extra_copy_count, 0) > 0 or coalesce(o.premium_copy_count, 0) > 0 then
    raise exception 'V2 base purchase must not include reprint options';
  end if;
  if o.book_project_id is not null then
    select * into p from public.book_projects where id = o.book_project_id;
    if p.subject_person_id is null then raise exception 'A subject Person is required'; end if;
  elsif o.order_type = 'self' then
    raise exception 'A self purchase requires a project';
  end if;
  base_amount := greatest(0, coalesce(nullif(o.base_book_amount, 0), o.amount_subtotal, 0) - o.discount_amount);
  insert into public.experience_contracts (
    order_id, book_project_id, subject_person_id, purchaser_user_id, purchase_kind, guarantee_days, base_paid_amount
  ) values (o.id, p.id, p.subject_person_id, o.purchaser_user_id, o.order_type,
    case when o.order_type = 'gift' then 45 else 30 end, base_amount)
  returning * into c;
  return to_jsonb(c);
end;
$$;

create function public.confirm_experience_payment(input_order_id uuid, input_confirmed_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare o public.commerce_orders%rowtype; c public.experience_contracts%rowtype;
begin
  select * into o from public.commerce_orders where id = input_order_id for update;
  select * into c from public.experience_contracts where order_id = input_order_id for update;
  if c.order_id is null then return jsonb_build_object('version', 'legacy'); end if;
  if o.status not in ('paid', 'zero_paid') then raise exception 'Payment is not confirmed'; end if;
  if input_confirmed_at is null or input_confirmed_at < o.created_at - interval '5 minutes'
    or input_confirmed_at > now() + interval '5 minutes' then
    raise exception 'Invalid payment confirmation time';
  end if;
  if c.payment_confirmed_at is null then
    update public.experience_contracts set payment_confirmed_at = input_confirmed_at,
      guarantee_expires_at = input_confirmed_at + make_interval(days => guarantee_days),
      gift_activation_expires_at = case when purchase_kind = 'gift' then input_confirmed_at + interval '6 months' end,
      production_started_at = case when purchase_kind = 'self' then input_confirmed_at end,
      production_expires_at = case when purchase_kind = 'self' then input_confirmed_at + interval '1 year' end
    where order_id = input_order_id returning * into c;
  end if;
  return to_jsonb(c);
end;
$$;

create function public.bind_gift_experience_contract(input_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare c public.experience_contracts%rowtype; g public.gift_orders%rowtype; p public.book_projects%rowtype;
begin
  select * into c from public.experience_contracts where order_id = input_order_id for update;
  if c.order_id is null then return jsonb_build_object('version', 'legacy'); end if;
  select * into g from public.gift_orders where commerce_order_id = input_order_id;
  select * into p from public.book_projects where id = g.recipient_project_id;
  if c.purchase_kind <> 'gift' or c.payment_confirmed_at is null or c.refund_confirmed_at is not null
    or g.claimed_at is null or p.subject_person_id is null then raise exception 'Claimed paid gift is required'; end if;
  if exists (select 1 from public.experience_refund_requests where order_id = input_order_id) then
    raise exception 'A refund request is being processed';
  end if;
  if c.book_project_id is not null and (c.book_project_id <> p.id or c.subject_person_id <> p.subject_person_id) then
    raise exception 'A gift cannot be reassigned to another Person';
  end if;
  update public.experience_contracts set book_project_id = p.id, subject_person_id = p.subject_person_id
  where order_id = input_order_id returning * into c;
  return to_jsonb(c);
end;
$$;

create function public.get_experience_access(input_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare c public.experience_contracts%rowtype;
begin
  if not public.can_confirm_experience_intent(input_project_id) then
    raise exception 'Project access is required' using errcode = '42501';
  end if;
  select * into c from public.experience_contracts where book_project_id = input_project_id
    order by (refund_confirmed_at is null) desc, created_at desc limit 1;
  if c.order_id is null then return jsonb_build_object('policy_version', 'legacy'); end if;
  return jsonb_build_object('policy_version', c.policy_version,
    'paid', c.payment_confirmed_at is not null, 'main_started_at', c.main_experience_started_at,
    'guarantee_days', c.guarantee_days, 'guarantee_expires_at', c.guarantee_expires_at,
    'production_started_at', c.production_started_at, 'production_expires_at', c.production_expires_at,
    'gift_activation_expires_at', c.gift_activation_expires_at,
    'refund_confirmed_at', c.refund_confirmed_at, 'export_available_until', c.export_available_until,
    'can_create', c.payment_confirmed_at is not null and c.refund_confirmed_at is null
      and c.production_started_at is not null and now() <= c.production_expires_at
      and not exists (select 1 from public.experience_refund_requests r where r.order_id = c.order_id),
    'retention_review_required', c.export_available_until is not null and now() > c.export_available_until);
end;
$$;

create function public.start_paid_starting_chapter(input_project_id uuid, input_subject_intent_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare c public.experience_contracts%rowtype;
begin
  if not public.can_confirm_experience_intent(input_project_id) then
    raise exception 'Project access is required' using errcode = '42501';
  end if;
  if input_subject_intent_confirmed is distinct from true then raise exception 'The subject must choose to begin'; end if;
  select * into c from public.experience_contracts
    where book_project_id = input_project_id and payment_confirmed_at is not null and refund_confirmed_at is null for update;
  if c.order_id is null then raise exception 'An active v2 purchase is required'; end if;
  if exists (select 1 from public.experience_refund_requests where order_id = c.order_id) then
    raise exception 'A refund request is being processed';
  end if;
  if c.production_started_at is null then
    if c.gift_activation_expires_at is null or now() > c.gift_activation_expires_at then
      raise exception 'Please contact support to extend the gift activation period';
    end if;
    update public.experience_contracts set production_started_at = now(), production_expires_at = now() + interval '1 year'
    where order_id = c.order_id returning * into c;
  end if;
  -- Starting the paid introduction must NOT end the refund guarantee.
  if now() > c.production_expires_at then
    raise exception 'Please contact support to extend the production period';
  end if;
  return jsonb_build_object('production_started_at', c.production_started_at,
    'production_expires_at', c.production_expires_at);
end;
$$;

create function public.start_main_experience(input_project_id uuid, input_subject_intent_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare c public.experience_contracts%rowtype; p public.book_projects%rowtype;
begin
  if not public.can_confirm_experience_intent(input_project_id) then
    raise exception 'Project access is required' using errcode = '42501';
  end if;
  if input_subject_intent_confirmed is distinct from true then raise exception 'The subject must choose to begin'; end if;
  select * into c from public.experience_contracts
    where book_project_id = input_project_id and payment_confirmed_at is not null and refund_confirmed_at is null
    for update;
  if c.order_id is null then raise exception 'An active v2 purchase is required'; end if;
  if c.production_started_at is null or now() > c.production_expires_at then raise exception 'Production period is not active'; end if;
  if exists (select 1 from public.experience_refund_requests where order_id = c.order_id) then
    raise exception 'A refund request is being processed';
  end if;
  if c.main_experience_started_at is not null then
    return jsonb_build_object('main_experience_started_at', c.main_experience_started_at);
  end if;
  select * into p from public.book_projects where id = input_project_id;
  if p.subject_person_id is distinct from c.subject_person_id then raise exception 'Subject mismatch'; end if;
  if coalesce(p.onboarding_ritual_step, '') not in ('chapter_complete', 'theme_intro', 'completed') then
    raise exception 'Finish the starting chapter before beginning the main experience';
  end if;
  update public.experience_contracts set main_experience_started_at = now(), main_started_by = auth.uid()
  where order_id = c.order_id returning * into c;
  return jsonb_build_object('main_experience_started_at', c.main_experience_started_at);
end;
$$;

create function public.request_experience_refund(input_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare c public.experience_contracts%rowtype; r public.experience_refund_requests%rowtype;
  g public.gift_orders%rowtype; o public.commerce_orders%rowtype; package_refund integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into c from public.experience_contracts where order_id = input_order_id for update;
  if c.order_id is null or c.purchaser_user_id <> auth.uid() then
    raise exception 'Only the purchaser may request a refund' using errcode = '42501';
  end if;
  select * into r from public.experience_refund_requests where order_id = input_order_id;
  if r.id is not null then return to_jsonb(r); end if;
  -- Accept an unclaimed gift request now, preserving its deadline. Identity
  -- review is required before execution, not before accepting the request.
  if c.subject_person_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(c.subject_person_id::text, 0));
  end if;
  if c.payment_confirmed_at is null or c.refund_confirmed_at is not null or c.base_paid_amount = 0
    or c.main_experience_started_at is not null or now() > c.guarantee_expires_at then
    raise exception 'This order is not eligible for the voluntary guarantee';
  end if;
  if exists (select 1 from public.experience_refund_requests where subject_person_id = c.subject_person_id) then
    raise exception 'This subject already has a guarantee request';
  end if;
  select * into o from public.commerce_orders where id = input_order_id;
  select * into g from public.gift_orders where commerce_order_id = input_order_id;
  if o.gift_package_amount > 0 then
    -- A self-order option has no verified fulfilment state here: manual review.
    if g.id is null then raise exception 'Physical option fulfilment needs review'; end if;
    if g.package_status not in ('shipped', 'delivered') then
      package_refund := least(o.gift_package_amount, greatest(0, o.amount_total - c.base_paid_amount));
    end if;
  end if;
  insert into public.experience_refund_requests(order_id, subject_person_id, requested_by, base_amount, requested_amount, identity_review_required)
  values (c.order_id, c.subject_person_id, auth.uid(), c.base_paid_amount, c.base_paid_amount + package_refund, c.subject_person_id is null)
  returning * into r;
  return to_jsonb(r);
end;
$$;

create function public.resolve_experience_refund_subject(input_request_id uuid, input_subject_person_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare r public.experience_refund_requests%rowtype;
begin
  if input_subject_person_id is null then raise exception 'A verified subject is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(input_subject_person_id::text, 0));
  select * into r from public.experience_refund_requests where id = input_request_id for update;
  if r.id is null or r.status <> 'requested' then raise exception 'Request cannot be assigned'; end if;
  if r.subject_person_id is not null and r.subject_person_id <> input_subject_person_id then
    raise exception 'Cannot change the subject of a refund';
  end if;
  update public.experience_refund_requests set subject_person_id = input_subject_person_id, identity_review_required = false
  where id = r.id returning * into r;
  return to_jsonb(r);
end;
$$;

create function public.record_experience_refund_result(
  input_request_id uuid, input_stripe_refund_id text, input_status text,
  input_amount integer, input_confirmed_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare c public.experience_contracts%rowtype; r public.experience_refund_requests%rowtype; target_order uuid;
begin
  select order_id into target_order from public.experience_refund_requests where id = input_request_id;
  -- Same lock order as request/start: contract first, then request.
  select * into c from public.experience_contracts where order_id = target_order for update;
  select * into r from public.experience_refund_requests where id = input_request_id for update;
  if r.id is null then raise exception 'Refund request not found'; end if;
  if r.identity_review_required or r.subject_person_id is null then raise exception 'Verify the subject before refund execution'; end if;
  if input_status is null or input_status not in ('pending', 'failed', 'succeeded') or nullif(input_stripe_refund_id, '') is null
    or input_amount is distinct from r.requested_amount then raise exception 'Refund result does not match request'; end if;
  if r.stripe_refund_id is not null and r.stripe_refund_id <> input_stripe_refund_id then
    raise exception 'Different processor refund requires review';
  end if;
  if r.status = 'succeeded' then return to_jsonb(r); end if;
  if input_status = 'succeeded' and (input_confirmed_at is null or input_confirmed_at < r.requested_at - interval '5 minutes'
    or input_confirmed_at > now() + interval '5 minutes') then raise exception 'Invalid refund confirmation time'; end if;
  update public.experience_refund_requests set stripe_refund_id = input_stripe_refund_id,
    status = input_status, confirmed_at = case when input_status = 'succeeded' then input_confirmed_at else null end
  where id = r.id returning * into r;
  if input_status = 'succeeded' then
    update public.experience_contracts set refund_confirmed_at = input_confirmed_at,
      export_available_until = input_confirmed_at + interval '30 days'
    where order_id = c.order_id;
  end if;
  -- No DELETE here. Expiry leads to review of references, notice and obligations.
  return to_jsonb(r);
end;
$$;

create function public.record_trial_continuation_intent(
  input_project_id uuid, input_decision text, input_subject_intent_confirmed boolean
)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare i public.family_story_invitations%rowtype; p public.book_projects%rowtype;
  r public.family_trial_intents%rowtype; trial_total integer; trial_saved integer;
begin
  if not public.can_confirm_experience_intent(input_project_id) then
    raise exception 'Project access is required' using errcode = '42501';
  end if;
  if input_decision is null or input_decision not in ('continue', 'later')
    or input_subject_intent_confirmed is distinct from true then raise exception 'Confirm the subject intention'; end if;
  select * into i from public.family_story_invitations where recipient_project_id = input_project_id for update;
  if i.id is null or i.offer_type <> 'trial_gift'
    or i.status not in ('trial_started', 'trial_completed') then raise exception 'Trial invitation is not awaiting a decision'; end if;
  select * into p from public.book_projects where id = input_project_id;
  if p.subject_person_id is null then raise exception 'Subject Person is required'; end if;
  select count(*), count(*) filter (where uq.status = 'answered' and exists (
    select 1 from public.answers a join public.media_assets m on m.answer_id = a.id
    where a.user_question_id = uq.id and a.book_project_id = p.id
      and a.subject_person_id = p.subject_person_id and m.asset_type = 'audio'
      and nullif(m.storage_path, '') is not null
  )) into trial_total, trial_saved
  from public.user_questions uq where uq.book_project_id = p.id and uq.is_active = true
    and uq.meta_json->>'onboarding_group' = 'trial_experience';
  if trial_total <> 3 or trial_saved <> 3 then raise exception 'Three saved trial recordings are required'; end if;
  select * into r from public.family_trial_intents where invitation_id = i.id;
  if r.decision = input_decision then return to_jsonb(r); end if;
  -- "For now" may become "continue" on a later visit. Cancel unsent old notices.
  update public.experience_notification_outbox set status = 'cancelled'
  where invitation_id = i.id and status in ('pending', 'failed');
  insert into public.family_trial_intents(invitation_id, book_project_id, subject_person_id,
    actor_user_id, decision, subject_intent_confirmed)
  values (i.id, p.id, p.subject_person_id, auth.uid(), input_decision, true)
  on conflict (invitation_id) do update set intent_id = gen_random_uuid(),
    actor_user_id = excluded.actor_user_id, decision = excluded.decision, decided_at = now()
  returning * into r;
  if input_decision = 'continue' then
    insert into public.experience_notification_outbox(dedupe_key, kind, invitation_id, intent_id, recipient_user_id)
    values ('family-continue:' || r.intent_id::text, 'family_continue_requested', i.id, r.intent_id, i.inviter_user_id);
  end if;
  -- A separate outbox owns delivery; this write never sends mail or reveals text.
  return to_jsonb(r);
end;
$$;

revoke all on function public.can_confirm_experience_intent(uuid) from public, anon;
grant execute on function public.can_confirm_experience_intent(uuid) to authenticated, service_role;
revoke all on function public.register_experience_contract(uuid), public.confirm_experience_payment(uuid, timestamptz),
  public.bind_gift_experience_contract(uuid), public.resolve_experience_refund_subject(uuid, uuid),
  public.record_experience_refund_result(uuid, text, text, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.register_experience_contract(uuid), public.confirm_experience_payment(uuid, timestamptz),
  public.bind_gift_experience_contract(uuid), public.resolve_experience_refund_subject(uuid, uuid),
  public.record_experience_refund_result(uuid, text, text, integer, timestamptz)
  to service_role;
revoke all on function public.get_experience_access(uuid), public.start_main_experience(uuid, boolean),
  public.start_paid_starting_chapter(uuid, boolean), public.request_experience_refund(uuid),
  public.record_trial_continuation_intent(uuid, text, boolean) from public, anon;
grant execute on function public.get_experience_access(uuid), public.start_main_experience(uuid, boolean),
  public.start_paid_starting_chapter(uuid, boolean), public.request_experience_refund(uuid),
  public.record_trial_continuation_intent(uuid, text, boolean) to authenticated;

commit;
