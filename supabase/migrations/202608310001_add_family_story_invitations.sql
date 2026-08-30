begin;

insert into public.commerce_settings(setting_key, integer_value)
values
  ('family_invite_discount_percent', 0),
  ('family_invite_response_days', 14)
on conflict (setting_key) do nothing;

alter table public.commerce_orders
  drop constraint if exists commerce_orders_order_type_check;
alter table public.commerce_orders
  add constraint commerce_orders_order_type_check
  check (order_type in ('self', 'gift', 'family_trial_package'));

create table if not exists public.family_story_invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_name text not null,
  recipient_email text,
  relationship_label text not null default 'other',
  assistance_mode text not null default 'recipient_led',
  offer_type text not null default 'referral',
  delivery_method text not null default 'email',
  message_template text not null default 'hear_your_story',
  personal_message text,
  shipping_address jsonb not null default '{}'::jsonb,
  supporter_requested boolean not null default false,
  progress_sharing text not null default 'milestones',
  status text not null default 'ready',
  email_delivery_status text not null default 'not_requested',
  package_status text not null default 'not_requested',
  commerce_order_id uuid references public.commerce_orders(id) on delete set null,
  gift_order_id uuid references public.gift_orders(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_project_id uuid references public.book_projects(id) on delete set null,
  claim_token text not null unique,
  claim_code text not null unique,
  opened_at timestamptz,
  claimed_at timestamptz,
  trial_started_at timestamptz,
  trial_completed_at timestamptz,
  trial_completion_notified_at timestamptz,
  continuation_decision text,
  continuation_decided_at timestamptz,
  started_at timestamptz,
  book_preparation_started_at timestamptz,
  completed_at timestamptz,
  email_attempted_at timestamptz,
  email_sent_at timestamptz,
  email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_story_invitations_relationship_check check (
    relationship_label in ('parent', 'grandparent', 'spouse', 'sibling', 'child', 'grandchild', 'other')
  ),
  constraint family_story_invitations_assistance_check check (
    assistance_mode in ('recipient_led', 'support_requested', 'recipient_chooses')
  ),
  constraint family_story_invitations_offer_check check (
    offer_type in ('referral', 'trial_gift', 'full_gift')
  ),
  constraint family_story_invitations_delivery_check check (
    delivery_method in ('email', 'package')
  ),
  constraint family_story_invitations_progress_check check (
    progress_sharing in ('none', 'milestones')
  ),
  constraint family_story_invitations_status_check check (
    status in (
      'awaiting_payment', 'ready', 'sent', 'opened', 'accepted',
      'trial_started', 'trial_completed', 'continuation_awaiting_payment',
      'continuation_declined', 'started', 'book_preparation', 'completed',
      'revoked', 'expired'
    )
  ),
  constraint family_story_invitations_email_status_check check (
    email_delivery_status in ('not_requested', 'pending', 'sending', 'sent', 'failed')
  ),
  constraint family_story_invitations_package_status_check check (
    package_status in ('not_requested', 'awaiting_payment', 'pending', 'preparing', 'shipped', 'delivered', 'cancelled')
  ),
  constraint family_story_invitations_continuation_check check (
    continuation_decision is null or continuation_decision in ('gift', 'decline')
  ),
  constraint family_story_invitations_email_required check (
    delivery_method <> 'email' or nullif(btrim(coalesce(recipient_email, '')), '') is not null
  )
);

create index if not exists family_story_invitations_inviter_idx
  on public.family_story_invitations(inviter_user_id, created_at desc);
create index if not exists family_story_invitations_recipient_idx
  on public.family_story_invitations(recipient_user_id, created_at desc)
  where recipient_user_id is not null;
create index if not exists family_story_invitations_project_idx
  on public.family_story_invitations(recipient_project_id)
  where recipient_project_id is not null;
create index if not exists family_story_invitations_status_idx
  on public.family_story_invitations(status, updated_at desc);
create unique index if not exists family_story_invitations_commerce_order_unique
  on public.family_story_invitations(commerce_order_id)
  where commerce_order_id is not null;
create unique index if not exists family_story_invitations_gift_order_unique
  on public.family_story_invitations(gift_order_id)
  where gift_order_id is not null;
create unique index if not exists family_story_invitations_recipient_project_unique
  on public.family_story_invitations(recipient_project_id)
  where recipient_project_id is not null;

drop trigger if exists family_story_invitations_updated_at on public.family_story_invitations;
create trigger family_story_invitations_updated_at
before update on public.family_story_invitations
for each row execute function public.set_updated_at();

alter table public.family_story_invitations enable row level security;
revoke all on table public.family_story_invitations from public, anon, authenticated;
grant all on table public.family_story_invitations to service_role;
grant select on table public.family_story_invitations to authenticated;

create policy family_story_invitations_inviter_select
on public.family_story_invitations for select to authenticated
using (inviter_user_id = auth.uid());

create policy family_story_invitations_recipient_select
on public.family_story_invitations for select to authenticated
using (recipient_user_id = auth.uid());

create or replace function public.create_family_story_invitation(
  input_recipient_name text,
  input_recipient_email text,
  input_relationship_label text,
  input_assistance_mode text,
  input_offer_type text,
  input_delivery_method text,
  input_message_template text,
  input_personal_message text default null,
  input_shipping_address jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.family_story_invitations%rowtype;
  normalized_name text := nullif(btrim(coalesce(input_recipient_name, '')), '');
  normalized_email text := nullif(lower(btrim(coalesce(input_recipient_email, ''))), '');
  next_status text;
  next_email_status text;
  next_package_status text;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;
  if normalized_name is null or char_length(normalized_name) > 80 then
    raise exception '贈る相手のお名前を入力してください' using errcode = '22023';
  end if;
  if coalesce(input_relationship_label, '') not in ('parent', 'grandparent', 'spouse', 'sibling', 'child', 'grandchild', 'other') then
    raise exception '続柄を確認してください' using errcode = '22023';
  end if;
  if coalesce(input_assistance_mode, '') not in ('recipient_led', 'support_requested', 'recipient_chooses') then
    raise exception 'お手伝い方法を確認してください' using errcode = '22023';
  end if;
  if coalesce(input_offer_type, '') not in ('referral', 'trial_gift', 'full_gift') then
    raise exception '招待方法を確認してください' using errcode = '22023';
  end if;
  if coalesce(input_delivery_method, '') not in ('email', 'package') then
    raise exception '届け方を確認してください' using errcode = '22023';
  end if;
  if input_offer_type = 'referral' and input_delivery_method <> 'email' then
    raise exception '紹介はメールでお届けします' using errcode = '22023';
  end if;
  if input_delivery_method = 'email' and normalized_email is null then
    raise exception 'メールアドレスを入力してください' using errcode = '22023';
  end if;
  if input_delivery_method = 'package' and not (
    coalesce(input_shipping_address ->> 'postal_code', '') <> '' and
    coalesce(input_shipping_address ->> 'prefecture', '') <> '' and
    coalesce(input_shipping_address ->> 'city', '') <> '' and
    coalesce(input_shipping_address ->> 'line1', '') <> ''
  ) then
    raise exception 'ギフトパッケージのお届け先を入力してください' using errcode = '22023';
  end if;

  next_status := case
    when input_offer_type = 'full_gift' then 'awaiting_payment'
    when input_offer_type = 'trial_gift' and input_delivery_method = 'package' then 'awaiting_payment'
    else 'ready'
  end;
  next_email_status := case when input_delivery_method = 'email' and next_status = 'ready' then 'pending' else 'not_requested' end;
  next_package_status := case
    when input_delivery_method <> 'package' then 'not_requested'
    when next_status = 'awaiting_payment' then 'awaiting_payment'
    else 'pending'
  end;

  insert into public.family_story_invitations (
    inviter_user_id, recipient_name, recipient_email, relationship_label,
    assistance_mode, offer_type, delivery_method, message_template,
    personal_message, shipping_address, supporter_requested,
    progress_sharing, status, email_delivery_status, package_status,
    claim_token, claim_code
  ) values (
    auth.uid(), normalized_name, normalized_email, input_relationship_label,
    input_assistance_mode, input_offer_type, input_delivery_method,
    coalesce(nullif(btrim(input_message_template), ''), 'hear_your_story'),
    nullif(btrim(coalesce(input_personal_message, '')), ''),
    coalesce(input_shipping_address, '{}'::jsonb),
    input_assistance_mode = 'support_requested',
    case when input_offer_type in ('trial_gift', 'full_gift') then 'milestones' else 'none' end,
    next_status, next_email_status, next_package_status,
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ) returning * into result;

  return to_jsonb(result);
end;
$$;

create or replace function public.get_family_story_invitation_preview(input_claim_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'valid', i.status in ('ready', 'sent', 'opened', 'accepted', 'trial_started', 'trial_completed', 'continuation_awaiting_payment', 'continuation_declined', 'started'),
    'invitation_id', i.id,
    'recipient_name', i.recipient_name,
    'relationship_label', i.relationship_label,
    'assistance_mode', i.assistance_mode,
    'offer_type', i.offer_type,
    'delivery_method', i.delivery_method,
    'message_template', i.message_template,
    'personal_message', i.personal_message,
    'status', i.status,
    'continuation_decision', i.continuation_decision,
    'gift_claim_token', g.claim_token,
    'claimed', i.claimed_at is not null,
    'inviter_name', coalesce(
      nullif(btrim(concat_ws(' ', p.family_name, p.given_name)), ''),
      nullif(p.display_name, ''),
      'ご家族'
    ),
    'family_special_price', true
  ) into result
  from public.family_story_invitations i
  left join public.profiles p on p.id = i.inviter_user_id
  left join public.gift_orders g on g.id = i.gift_order_id
  where i.claim_token = input_claim_token;

  if result is not null then
    update public.family_story_invitations
    set opened_at = coalesce(opened_at, now()),
        status = case when status in ('ready', 'sent') then 'opened' else status end
    where claim_token = input_claim_token;
  end if;

  return coalesce(result, jsonb_build_object('valid', false));
end;
$$;

create or replace function public.claim_family_story_invitation(
  input_claim_token text,
  input_book_project_id uuid,
  input_accept_support boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invitation public.family_story_invitations%rowtype;
  project_row public.book_projects%rowtype;
  inviter_person_id uuid;
  current_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  select * into invitation
  from public.family_story_invitations
  where claim_token = input_claim_token
  for update;

  if invitation.id is null or invitation.status not in (
    'ready', 'sent', 'opened', 'accepted', 'trial_started', 'trial_completed',
    'continuation_awaiting_payment', 'continuation_declined', 'started'
  ) then
    raise exception 'この家族招待は利用できません' using errcode = '22023';
  end if;
  if invitation.recipient_email is not null and lower(invitation.recipient_email) <> current_email then
    raise exception '招待されたメールアドレスでログインしてください' using errcode = '42501';
  end if;
  if invitation.recipient_user_id is not null and invitation.recipient_user_id <> auth.uid() then
    raise exception 'この家族招待は受取済みです' using errcode = '22023';
  end if;

  select * into project_row
  from public.book_projects
  where id = input_book_project_id and owner_user_id = auth.uid()
  for update;
  if project_row.id is null then
    raise exception '物語を確認できません' using errcode = '42501';
  end if;

  update public.book_projects
  set onboarding_preferences = coalesce(onboarding_preferences, '{}'::jsonb) || jsonb_build_object(
        'family_invitation_id', invitation.id,
        'family_offer_type', invitation.offer_type,
        'family_special_price_eligible', true,
        'family_inviter_user_id', invitation.inviter_user_id,
        'family_assistance_mode', invitation.assistance_mode
      ),
      updated_at = now()
  where id = project_row.id;

  if input_accept_support and invitation.assistance_mode in ('support_requested', 'recipient_chooses') then
    select person_id into inviter_person_id
    from public.user_person_links
    where user_id = invitation.inviter_user_id and role = 'self'
    order by created_at, id
    limit 1;

    insert into public.project_supporters (
      book_project_id, supporter_user_id, supporter_person_id,
      granted_by_user_id, status, can_operate_recording, can_manage_photos,
      can_edit_book_text, can_build_book, can_view_raw_audio,
      can_change_sharing, can_change_legacy, can_delete_story, meta_json
    ) values (
      project_row.id, invitation.inviter_user_id, inviter_person_id,
      auth.uid(), 'active', true, true, true, true, true,
      false, false, false,
      jsonb_build_object('support_role', 'family_supporter', 'family_invitation_id', invitation.id)
    )
    on conflict (book_project_id, supporter_user_id) do update set
      status = 'active', revoked_at = null,
      can_operate_recording = true, can_manage_photos = true,
      can_edit_book_text = true, can_build_book = true,
      meta_json = coalesce(public.project_supporters.meta_json, '{}'::jsonb)
        || jsonb_build_object('support_role', 'family_supporter', 'family_invitation_id', invitation.id),
      updated_at = now();
  end if;

  update public.family_story_invitations
  set recipient_user_id = auth.uid(),
      recipient_project_id = project_row.id,
      claimed_at = coalesce(claimed_at, now()),
      trial_started_at = coalesce(trial_started_at, now()),
      status = case when status in ('ready', 'sent', 'opened', 'accepted') then 'trial_started' else status end
  where id = invitation.id;

  return jsonb_build_object(
    'success', true,
    'invitation_id', invitation.id,
    'project_id', project_row.id,
    'supporter_connected', input_accept_support and invitation.assistance_mode in ('support_requested', 'recipient_chooses'),
    'offer_type', invitation.offer_type
  );
end;
$$;

create or replace function public.mark_family_invitation_trial_complete(input_book_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invitation public.family_story_invitations%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.book_projects
    where id = input_book_project_id and owner_user_id = auth.uid()
  ) then
    raise exception '物語を確認できません' using errcode = '42501';
  end if;

  update public.family_story_invitations
  set status = case
        when offer_type = 'full_gift' then 'started'
        else 'trial_completed'
      end,
      trial_completed_at = coalesce(trial_completed_at, now()),
      started_at = case when offer_type = 'full_gift' then coalesce(started_at, now()) else started_at end
  where recipient_project_id = input_book_project_id
    and status not in ('revoked', 'expired', 'completed')
  returning * into invitation;

  return case when invitation.id is null
    then jsonb_build_object('found', false)
    else jsonb_build_object(
      'found', true,
      'invitation_id', invitation.id,
      'offer_type', invitation.offer_type,
      'status', invitation.status,
      'notify_inviter', invitation.offer_type = 'trial_gift' and invitation.progress_sharing = 'milestones'
    )
  end;
end;
$$;

create or replace function public.list_sent_family_story_invitations()
returns table (
  invitation_id uuid,
  recipient_name text,
  relationship_label text,
  offer_type text,
  delivery_method text,
  status text,
  package_status text,
  trial_completed_at timestamptz,
  trial_completion_notified_at timestamptz,
  continuation_decision text,
  started_at timestamptz,
  book_preparation_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    i.id, i.recipient_name, i.relationship_label, i.offer_type,
    i.delivery_method, i.status, i.package_status, i.trial_completed_at,
    i.trial_completion_notified_at,
    i.continuation_decision, i.started_at,
    i.book_preparation_started_at, i.completed_at, i.created_at
  from public.family_story_invitations i
  where i.inviter_user_id = auth.uid()
    and i.status not in ('revoked', 'expired')
  order by i.created_at desc, i.id;
$$;

create or replace function public.decide_family_invitation_continuation(
  input_invitation_id uuid,
  input_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invitation public.family_story_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;
  if input_decision not in ('gift', 'decline') then
    raise exception '選択を確認してください' using errcode = '22023';
  end if;

  update public.family_story_invitations
  set continuation_decision = input_decision,
      continuation_decided_at = now(),
      status = case when input_decision = 'gift' then 'continuation_awaiting_payment' else 'continuation_declined' end
  where id = input_invitation_id
    and inviter_user_id = auth.uid()
    and status = 'trial_completed'
  returning * into invitation;

  if invitation.id is null then
    raise exception 'このお試しの続きを変更できません' using errcode = '22023';
  end if;
  return to_jsonb(invitation);
end;
$$;

create or replace function public.sync_family_invitation_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation_row public.family_story_invitations%rowtype;
  linked_gift public.gift_orders%rowtype;
begin
  if new.status in ('paid', 'zero_paid')
     and old.status is distinct from new.status then
    update public.family_story_invitations i
    set status = case when new.order_type = 'self' then 'started' else 'ready' end,
        started_at = case when new.order_type = 'self' then coalesce(i.started_at, now()) else i.started_at end,
        package_status = case
          when i.delivery_method = 'package' then 'pending'
          else i.package_status
        end,
        email_delivery_status = case
          when i.delivery_method = 'email' then 'pending'
          else i.email_delivery_status
        end,
        gift_order_id = coalesce(
          i.gift_order_id,
          (select g.id from public.gift_orders g where g.commerce_order_id = new.id)
        )
    where i.commerce_order_id = new.id
      and i.status in ('awaiting_payment', 'continuation_awaiting_payment', 'trial_completed', 'continuation_declined')
    returning * into invitation_row;

    if invitation_row.id is not null
       and invitation_row.recipient_project_id is not null then
      select * into linked_gift
      from public.gift_orders g
      where g.commerce_order_id = new.id;

      if linked_gift.id is not null then
        perform set_config('app.payment_flow', 'on', true);
        update public.book_projects
        set access_status = 'gifted',
            purchaser_user_id = new.purchaser_user_id,
            purchased_at = new.purchased_at,
            commerce_order_id = new.id
        where id = invitation_row.recipient_project_id;

        update public.commerce_orders
        set book_project_id = invitation_row.recipient_project_id
        where id = new.id;

        update public.gift_orders
        set claimed_by_user_id = invitation_row.recipient_user_id,
            claimed_at = coalesce(claimed_at, now()),
            recipient_project_id = invitation_row.recipient_project_id
        where id = linked_gift.id;

        update public.family_story_invitations
        set status = 'started', started_at = coalesce(started_at, now())
        where id = invitation_row.id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists commerce_order_family_invitation_paid on public.commerce_orders;
create trigger commerce_order_family_invitation_paid
after update of status on public.commerce_orders
for each row execute function public.sync_family_invitation_after_payment();

revoke all on function public.create_family_story_invitation(text, text, text, text, text, text, text, text, jsonb) from public;
revoke all on function public.get_family_story_invitation_preview(text) from public;
revoke all on function public.claim_family_story_invitation(text, uuid, boolean) from public;
revoke all on function public.mark_family_invitation_trial_complete(uuid) from public;
revoke all on function public.list_sent_family_story_invitations() from public;
revoke all on function public.decide_family_invitation_continuation(uuid, text) from public;

grant execute on function public.create_family_story_invitation(text, text, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.get_family_story_invitation_preview(text) to anon, authenticated;
grant execute on function public.claim_family_story_invitation(text, uuid, boolean) to authenticated;
grant execute on function public.mark_family_invitation_trial_complete(uuid) to authenticated;
grant execute on function public.list_sent_family_story_invitations() to authenticated;
grant execute on function public.decide_family_invitation_continuation(uuid, text) to authenticated;

comment on table public.family_story_invitations is
  '本人主体の家族紹介・3問ギフト・購入済みギフトと、内容を共有しない節目通知を管理する。';

commit;
