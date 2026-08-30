-- A family invitation records the relationship and optional supporter access.
-- Paid access remains exclusively owned by claim_gift_order/finalize_commerce_order.
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
