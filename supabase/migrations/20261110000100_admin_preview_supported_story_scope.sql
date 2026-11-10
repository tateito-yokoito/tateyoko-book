-- Display-only admin scope mirrors the active supporter capabilities and sharing
-- rules used by the customer RPCs. admin_customer_preview records the audit event.
create or replace function public.admin_preview_supported_context(
  input_project_id uuid, input_supporter_user_id uuid
) returns jsonb language plpgsql stable security definer
set search_path = public, auth as $$
declare
  target_supporter public.project_supporters%rowtype;
  target_role text;
  can_read_stories boolean;
  shared_stories boolean;
  home_questions jsonb;
  visible_ids jsonb;
begin
  if auth.uid() is null or public.is_tateyoko_admin() is distinct from true then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select ps.* into target_supporter
  from public.project_supporters ps
  join public.book_projects bp on bp.id = ps.book_project_id
  where ps.book_project_id = input_project_id
    and ps.supporter_user_id = input_supporter_user_id
    and ps.status = 'active' and bp.status = 'active'
    and (ps.can_operate_recording or ps.can_edit_book_text or ps.can_build_book)
  limit 1;
  if not found then
    raise exception 'Target account cannot open supported project' using errcode = '42501';
  end if;
  target_role := coalesce(target_supporter.meta_json ->> 'support_role', 'helper');
  can_read_stories := target_supporter.can_edit_book_text or target_supporter.can_build_book;

  -- Same sharing predicate as supporter_can_view_shared_story, evaluated for
  -- the previewed account instead of the admin's auth.uid().
  select exists (
    select 1 from public.story_sharing_preferences pref
    join public.story_share_recipients recipient
      on recipient.sharing_preference_id = pref.id
    where pref.book_project_id = input_project_id
      and pref.selected_sharing_enabled = true
      and recipient.recipient_user_id = input_supporter_user_id
      and recipient.status = 'active'
      and recipient.recipient_phase in ('live', 'both')
  ) into shared_stories;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_question_id', uq.id,
    'owner_user_id', bp.owner_user_id,
    'subject_person_id', bp.subject_person_id,
    'family_id', bp.family_id,
    'sequence_order', uq.sequence_order,
    'question_id', uq.question_id,
    'content', coalesce(uq.custom_question_text, uq.question_text_snapshot, ''),
    'chapter', coalesce(uq.chapter_title_snapshot, uq.chapter, 'その他'),
    'chapter_label', coalesce(uq.chapter_title_snapshot, uq.chapter, 'その他'),
    'status', coalesce(uq.status, 'pending'),
    'prompt_style', coalesce(uq.meta_json ->> 'prompt_style', ''),
    'prompt_hint', coalesce(uq.meta_json ->> 'prompt_hint', ''),
    'reassurance_text', coalesce(uq.meta_json ->> 'reassurance_text', ''),
    'followup_hint', coalesce(uq.meta_json ->> 'followup_hint', ''),
    'min_duration_seconds', coalesce(nullif(uq.meta_json ->> 'min_duration_seconds', '')::integer, 25),
    'min_transcript_chars', coalesce(nullif(uq.meta_json ->> 'min_transcript_chars', '')::integer, 80),
    'flow_type', coalesce(uq.meta_json ->> 'flow_type', ''),
    'onboarding_group', coalesce(uq.meta_json ->> 'onboarding_group', ''),
    'answer_id', answer_row.id,
    'include_in_story_list', (uq.meta_json ->> 'flow_type') = 'story'
  ) order by uq.sequence_order), '[]'::jsonb) into home_questions
  from public.user_questions uq
  join public.book_projects bp on bp.id = uq.book_project_id
  left join lateral (
    select a.id from public.answers a
    where a.book_project_id = uq.book_project_id and a.user_question_id = uq.id
    order by a.created_at desc limit 1
  ) answer_row on true
  where uq.book_project_id = input_project_id and uq.is_active = true;

  select coalesce(jsonb_agg(a.id), '[]'::jsonb) into visible_ids
  from public.answers a
  where a.book_project_id = input_project_id
    and can_read_stories
    and (
      target_role in ('facilitator', 'co_manager')
      or (shared_stories and coalesce(a.access_override, 'inherit') <> 'private_forever')
    );
  return jsonb_build_object(
    'questions', home_questions, 'answer_ids', visible_ids,
    'family_managed', public.family_managed(input_project_id),
    'full_media', target_role in ('facilitator', 'co_manager'),
    'can_read_photos', target_supporter.can_manage_photos or can_read_stories
  );
end;
$$;

revoke all on function public.admin_preview_supported_context(uuid, uuid) from public, anon;
grant execute on function public.admin_preview_supported_context(uuid, uuid) to authenticated;
