-- Preserve legacy bodies for ordinary self-use; close owner-based bypasses
-- for Person-bound family projects. No source IDs or payer fields are changed.
begin;

CREATE OR REPLACE FUNCTION public.set_story_relationship_paused(input_book_project_id uuid, input_relationship_id uuid, input_paused boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare target public.story_relationship_invites%rowtype;
begin
 if not exists (select 1 from public.book_projects bp where bp.id = input_book_project_id and public.family_subject_or_legacy_owner(bp.id, auth.uid()))
 then raise exception 'Project owner access is required'; end if;
 select * into target from public.story_relationship_invites
 where id = input_relationship_id and book_project_id = input_book_project_id and status in ('accepted','paused');
 if target.id is null then return false; end if;

 update public.story_relationship_invites set status = case when input_paused then 'paused' else 'accepted' end, updated_at = now()
 where id = target.id;
 update public.story_share_recipients r set status = case when input_paused then 'revoked' else 'active' end, updated_at = now()
 from public.story_sharing_preferences pref where pref.id = r.sharing_preference_id
 and pref.book_project_id = input_book_project_id and r.recipient_user_id = target.recipient_user_id and r.source = target.invite_type;
 if target.invite_type = 'family' and target.recipient_user_id is not null then
 update public.family_memberships fm set status = case when input_paused then 'paused' else 'active' end, updated_at = now()
 from public.book_projects bp where bp.id = input_book_project_id and fm.family_id = bp.family_id and fm.user_id = target.recipient_user_id;
 end if;
 return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.end_project_supporter(input_book_project_id uuid, input_supporter_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
 target_supporter_user_id uuid;
begin
 if not exists (
 select 1 from public.book_projects bp
 where bp.id = input_book_project_id
 and public.family_subject_or_legacy_owner(bp.id, auth.uid())
 ) then
 raise exception 'Project owner access is required';
 end if;

 update public.project_supporters ps
 set
 status = 'revoked',
 revoked_at = now(),
 updated_at = now()
 where ps.id = input_supporter_id
 and ps.book_project_id = input_book_project_id
 returning ps.supporter_user_id into target_supporter_user_id;

 if target_supporter_user_id is null then
 raise exception 'Supporter was not found';
 end if;

 update public.story_share_recipients recipient
 set
 status = 'revoked',
 updated_at = now()
 from public.story_sharing_preferences pref
 where recipient.sharing_preference_id = pref.id
 and pref.book_project_id = input_book_project_id
 and recipient.recipient_user_id = target_supporter_user_id
 and recipient.source = 'supporter';

 return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_owned_project_supporters(input_book_project_id uuid)
 RETURNS TABLE(invite_id uuid, supporter_id uuid, invitee_email text, display_name text, relationship_status text, email_delivery_status text, requested_at timestamp with time zone, accepted_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
 if not exists (
 select 1 from public.book_projects bp
 where bp.id = input_book_project_id
 and public.family_subject_or_legacy_owner(bp.id, auth.uid())
 ) then
 raise exception 'Project owner access is required';
 end if;

 return query
 with latest_invites as (
 select distinct on (lower(btrim(pi.invitee_email)))
 pi.*
 from public.project_invites pi
 where pi.book_project_id = input_book_project_id
 and pi.role = 'supporter'
 order by lower(btrim(pi.invitee_email)), pi.created_at desc
 )
 select
 pi.id,
 ps.id,
 pi.invitee_email,
 coalesce(person.preferred_name, person.display_name, pi.invitee_email),
 case
 when ps.status = 'active' then 'active'
 when pi.status = 'pending' then 'pending'
 else 'ended'
 end,
 coalesce(pi.email_delivery_status, 'not_sent'),
 pi.created_at,
 pi.accepted_at
 from latest_invites pi
 left join public.project_supporters ps
 on ps.book_project_id = pi.book_project_id
 and nullif(ps.meta_json ->> 'invite_id', '') = pi.id::text
 left join public.persons person
 on person.id = ps.supporter_person_id
 order by pi.created_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_supporter_invite(input_book_project_id uuid, input_invite_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
 if not exists (
 select 1 from public.book_projects bp
 where bp.id = input_book_project_id
 and public.family_subject_or_legacy_owner(bp.id, auth.uid())
 ) then
 raise exception 'Project owner access is required';
 end if;

 update public.project_invites
 set status = 'declined'
 where id = input_invite_id
 and book_project_id = input_book_project_id
 and role = 'supporter'
 and status = 'pending';

 return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_story_relationship_invite(input_book_project_id uuid, input_email text, input_invite_type text, input_invitee_name text DEFAULT NULL::text, input_relationship_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
 normalized_email text := lower(btrim(coalesce(input_email, '')));
 target_preference public.story_sharing_preferences%rowtype;
 new_id uuid;
begin
 if not exists (
 select 1 from public.book_projects bp
 where bp.id = input_book_project_id and public.family_subject_or_legacy_owner(bp.id, auth.uid()) and bp.status = 'active'
 ) then raise exception 'Project owner access is required'; end if;
 if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
 raise exception 'A valid email address is required';
 end if;
 if input_invite_type not in ('family', 'selected') then raise exception 'Invalid invitation type'; end if;

 insert into public.story_sharing_preferences (book_project_id, owner_person_id, live_scope)
 select bp.id, bp.subject_person_id, 'private' from public.book_projects bp where bp.id = input_book_project_id
 on conflict on constraint story_sharing_preferences_project_unique do nothing;

 update public.story_sharing_preferences
 set
 family_sharing_enabled = family_sharing_enabled or input_invite_type = 'family',
 selected_sharing_enabled = selected_sharing_enabled or input_invite_type = 'selected',
 live_scope = case
 when selected_sharing_enabled or input_invite_type = 'selected' then 'selected'
 when family_sharing_enabled or input_invite_type = 'family' then 'family'
 else 'private'
 end,
 initial_setup_completed_at = coalesce(initial_setup_completed_at, now()),
 updated_at = now()
 where book_project_id = input_book_project_id;

 update public.story_relationship_invites
 set status = 'revoked', revoked_at = now(), updated_at = now()
 where book_project_id = input_book_project_id
 and lower(btrim(invitee_email)) = normalized_email
 and invite_type = input_invite_type
 and status in ('pending', 'accepted');

 insert into public.story_relationship_invites (
 book_project_id, inviter_user_id, invitee_email, invite_type,
 invitee_name, relationship_label
 ) values (
 input_book_project_id, auth.uid(), normalized_email, input_invite_type,
 nullif(btrim(coalesce(input_invitee_name, '')), ''),
 case when input_invite_type = 'family' then coalesce(input_relationship_label, 'other') else null end
 ) returning id into new_id;
 return new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_owned_story_relationships(input_book_project_id uuid)
 RETURNS TABLE(relationship_id uuid, invite_type text, invitee_email text, display_name text, relationship_label text, relationship_status text, email_delivery_status text, is_supporter boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
 if not exists (
 select 1 from public.book_projects bp
 where bp.id = input_book_project_id and public.family_subject_or_legacy_owner(bp.id, auth.uid())
 ) then
 raise exception 'Project owner access is required';
 end if;

 return query
 select
 i.id,
 i.invite_type,
 i.invitee_email,
 coalesce(
 nullif(btrim(i.invitee_name), ''),
 nullif(btrim(concat_ws(' ', p.family_name, p.given_name)), ''),
 nullif(p.display_name, 'あなた'),
 i.invitee_email
 ),
 i.relationship_label,
 i.status,
 i.email_delivery_status,
 exists (
 select 1 from public.project_supporters ps
 where ps.book_project_id = i.book_project_id
 and ps.supporter_user_id = i.recipient_user_id
 and ps.status = 'active'
 ),
 i.created_at
 from public.story_relationship_invites i
 left join public.persons p on p.id = i.recipient_person_id
 where i.book_project_id = input_book_project_id
 and i.status <> 'revoked'
 order by i.created_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_story_relationship(input_book_project_id uuid, input_relationship_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare target public.story_relationship_invites%rowtype;
begin
 if not exists (select 1 from public.book_projects bp where bp.id = input_book_project_id and public.family_subject_or_legacy_owner(bp.id, auth.uid()))
 then raise exception 'Project owner access is required'; end if;
 select * into target from public.story_relationship_invites where id = input_relationship_id and book_project_id = input_book_project_id;
 if target.id is null then return false; end if;
 update public.story_relationship_invites set status = 'revoked', revoked_at = now(), updated_at = now() where id = target.id;
 update public.story_share_recipients r set status = 'revoked', updated_at = now()
 from public.story_sharing_preferences pref where pref.id = r.sharing_preference_id and pref.book_project_id = input_book_project_id
 and r.recipient_user_id = target.recipient_user_id and r.source = target.invite_type;
 if target.invite_type = 'family' and target.recipient_user_id is not null then
 update public.family_memberships fm set status = 'revoked', revoked_at = now(), updated_at = now()
 from public.book_projects bp where bp.id = input_book_project_id and fm.family_id = bp.family_id and fm.user_id = target.recipient_user_id;
 end if;
 return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.disable_story_sharing_scope(input_book_project_id uuid, input_scope text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
 if not exists (select 1 from public.book_projects bp where bp.id = input_book_project_id and public.family_subject_or_legacy_owner(bp.id, auth.uid()))
 then raise exception 'Project owner access is required'; end if;
 if input_scope = 'selected' then
 update public.project_supporters set status = 'revoked', revoked_at = now(), updated_at = now()
 where book_project_id = input_book_project_id and status = 'active';
 update public.project_invites set status = 'declined'
 where book_project_id = input_book_project_id and role = 'supporter' and status = 'pending';
 update public.story_share_recipients r set status = 'revoked', updated_at = now()
 from public.story_sharing_preferences pref where pref.id = r.sharing_preference_id
 and pref.book_project_id = input_book_project_id and r.source = 'supporter';
 update public.story_sharing_preferences set selected_sharing_enabled = false,
 live_scope = case when family_sharing_enabled then 'family' else 'private' end, updated_at = now()
 where book_project_id = input_book_project_id;
 elsif input_scope = 'family' then
 update public.story_sharing_preferences set family_sharing_enabled = false,
 live_scope = case when selected_sharing_enabled then 'selected' else 'private' end, updated_at = now()
 where book_project_id = input_book_project_id;
 else raise exception 'Invalid sharing scope'; end if;
 return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_supporter_recording(input_book_project_id uuid, input_user_question_id uuid, input_answer_id uuid, input_transcript_raw text, input_transcript_readable text, input_transcript_essay text, input_selected_style text, input_storage_paths text[], input_duration_seconds numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
 target_project public.book_projects%rowtype;
 target_question public.user_questions%rowtype;
 saved_answer_id uuid;
 storage_path_item text;
 storage_index integer := 0;
begin
 if public.family_managed(input_book_project_id) then raise exception 'Use family workspace' using errcode='42501'; end if;
 if not exists (
 select 1
 from public.project_supporters ps
 where ps.book_project_id = input_book_project_id
 and ps.supporter_user_id = auth.uid()
 and ps.status = 'active'
 and ps.can_operate_recording = true
 ) then
 raise exception 'Supporter recording access is not allowed';
 end if;

 select * into target_project
 from public.book_projects bp
 where bp.id = input_book_project_id
 and bp.status = 'active';

 if target_project.id is null then
 raise exception 'Book project was not found';
 end if;

 select * into target_question
 from public.user_questions uq
 where uq.id = input_user_question_id
 and uq.book_project_id = input_book_project_id
 and uq.is_active = true;

 if target_question.id is null then
 raise exception 'Question was not found';
 end if;

 select a.id into saved_answer_id
 from public.answers a
 where a.book_project_id = input_book_project_id
 and a.user_question_id = input_user_question_id
 order by a.created_at desc
 limit 1;

 if saved_answer_id is null then
 saved_answer_id := coalesce(input_answer_id, gen_random_uuid());

 insert into public.answers (
 id,
 user_id,
 book_project_id,
 speaker_person_id,
 subject_person_id,
 user_question_id,
 question_id,
 sequence_order,
 transcript_raw,
 transcript_clean,
 transcript_readable,
 transcript_essay,
 transcript_edited,
 selected_style,
 ai_mirror,
 snippet,
 meta_json
 ) values (
 saved_answer_id,
 target_project.owner_user_id,
 target_project.id,
 target_project.subject_person_id,
 target_project.subject_person_id,
 target_question.id,
 target_question.question_id,
 target_question.sequence_order,
 coalesce(input_transcript_raw, ''),
 coalesce(input_transcript_readable, input_transcript_raw, ''),
 coalesce(input_transcript_readable, input_transcript_raw, ''),
 nullif(input_transcript_essay, ''),
 coalesce(input_transcript_readable, input_transcript_raw, ''),
 coalesce(nullif(input_selected_style, ''), 'readable'),
 'ご家族と残した声が、ひとつの物語になりました',
 '',
 jsonb_build_object(
 'recorded_with_supporter', true,
 'supporter_user_id', auth.uid(),
 'duration_seconds', coalesce(input_duration_seconds, 0)
 )
 );
 else
 update public.answers
 set
 transcript_raw = coalesce(input_transcript_raw, ''),
 transcript_clean = coalesce(input_transcript_readable, input_transcript_raw, ''),
 transcript_readable = coalesce(input_transcript_readable, input_transcript_raw, ''),
 transcript_essay = nullif(input_transcript_essay, ''),
 transcript_edited = coalesce(input_transcript_readable, input_transcript_raw, ''),
 selected_style = coalesce(nullif(input_selected_style, ''), 'readable'),
 meta_json = coalesce(meta_json, '{}'::jsonb) || jsonb_build_object(
 'recorded_with_supporter', true,
 'supporter_user_id', auth.uid(),
 'duration_seconds', coalesce(input_duration_seconds, 0)
 )
 where id = saved_answer_id;

 delete from public.media_assets
 where answer_id = saved_answer_id
 and asset_type = 'audio';
 end if;

 foreach storage_path_item in array coalesce(input_storage_paths, array[]::text[])
 loop
 storage_index := storage_index + 1;

 insert into public.media_assets (
 answer_id,
 user_id,
 family_id,
 book_project_id,
 person_id,
 asset_type,
 storage_path,
 meta_json
 ) values (
 saved_answer_id,
 target_project.owner_user_id,
 target_project.family_id,
 target_project.id,
 target_project.subject_person_id,
 'audio',
 storage_path_item,
 jsonb_build_object(
 'part', storage_index,
 'total_parts', cardinality(input_storage_paths),
 'recorded_with_supporter', true,
 'supporter_user_id', auth.uid()
 )
 )
 on conflict (answer_id, asset_type, storage_path)
 do update set meta_json = excluded.meta_json;
 end loop;

 update public.user_questions
 set
 status = 'answered',
 answered_at = now()
 where id = target_question.id;

 return saved_answer_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.append_supporter_recording(input_book_project_id uuid, input_user_question_id uuid, input_answer_id uuid, input_transcript_raw text, input_transcript_readable text, input_transcript_essay text, input_selected_style text, input_storage_paths text[], input_duration_seconds numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  actor uuid := auth.uid();
  target_project public.book_projects%rowtype;
  target_question public.user_questions%rowtype;
  target_answer public.answers%rowtype;
  audio_path text;
  part_count integer;
  readable text := coalesce(nullif(input_transcript_readable, ''), input_transcript_raw, '');
begin
 if public.family_managed(input_book_project_id) then raise exception 'Use family workspace' using errcode='42501'; end if;
  if actor is null or not exists (
    select 1 from public.project_supporters
    where book_project_id = input_book_project_id and supporter_user_id = actor
      and status = 'active' and can_operate_recording = true
  ) then raise exception 'Supporter recording access is not allowed'; end if;

  select * into target_project from public.book_projects
  where id = input_book_project_id and status = 'active';
  if target_project.id is null then raise exception 'Book project was not found'; end if;

  -- Serialize saves for this question, including a retry following a timeout.
  select * into target_question from public.user_questions
  where id = input_user_question_id and book_project_id = input_book_project_id
    and is_active = true for update;
  if target_question.id is null then raise exception 'Question was not found'; end if;

  if input_answer_id is null or coalesce(cardinality(input_storage_paths), 0) <> 1 then
    raise exception 'Exactly one audio segment is required';
  end if;
  audio_path := input_storage_paths[1];
  if audio_path is null or audio_path not in (
    actor::text || '/' || input_book_project_id::text || '/' || input_answer_id::text || '/part-01.mp4',
    actor::text || '/' || input_book_project_id::text || '/' || input_answer_id::text || '/part-01.aac',
    actor::text || '/' || input_book_project_id::text || '/' || input_answer_id::text || '/part-01.webm',
    actor::text || '/' || input_answer_id::text || '/part-01.mp4',
    actor::text || '/' || input_answer_id::text || '/part-01.aac',
    actor::text || '/' || input_answer_id::text || '/part-01.webm'
  ) then raise exception 'Forbidden audio path'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'audio' and name = audio_path) then
    raise exception 'Uploaded audio was not found';
  end if;
  if input_duration_seconds is null or input_duration_seconds < 0 or input_duration_seconds > 86400 then
    raise exception 'Invalid duration';
  end if;

  select * into target_answer from public.answers
  where book_project_id = input_book_project_id and user_question_id = input_user_question_id
  order by created_at desc limit 1 for update;
  if exists (select 1 from public.media_assets where storage_path = audio_path and asset_type = 'audio') then
    if exists (select 1 from public.media_assets where answer_id = target_answer.id
      and storage_path = audio_path and asset_type = 'audio') then
      return target_answer.id;
    end if;
    raise exception 'Audio segment already belongs to another answer';
  end if;

  if target_answer.id is null then
    insert into public.answers (
      id, user_id, book_project_id, speaker_person_id, subject_person_id,
      user_question_id, question_id, sequence_order, transcript_raw,
      transcript_clean, transcript_readable, transcript_essay, transcript_edited,
      selected_style, ai_mirror, snippet, meta_json
    ) values (
      input_answer_id, target_project.owner_user_id, target_project.id,
      target_project.subject_person_id, target_project.subject_person_id,
      target_question.id, target_question.question_id, target_question.sequence_order,
      coalesce(input_transcript_raw, ''), readable, readable, nullif(input_transcript_essay, ''), readable,
      'readable', 'ご家族と残した声が、ひとつの物語になりました', '',
      jsonb_build_object('recorded_with_supporter', true, 'supporter_user_id', actor,
        'duration_seconds', input_duration_seconds)
    ) returning * into target_answer;
  else
    update public.answers set
      transcript_raw = concat_ws(E'\n\n', nullif(transcript_raw, ''), nullif(input_transcript_raw, '')),
      transcript_clean = concat_ws(E'\n\n', nullif(transcript_clean, ''), nullif(readable, '')),
      transcript_readable = concat_ws(E'\n\n', nullif(transcript_readable, ''), nullif(readable, '')),
      transcript_essay = concat_ws(E'\n\n', nullif(transcript_essay, ''), nullif(input_transcript_essay, '')),
      transcript_edited = concat_ws(E'\n\n', coalesce(nullif(transcript_edited, ''), nullif(transcript_readable, '')), nullif(readable, '')),
      selected_style = 'readable',
      meta_json = coalesce(meta_json, '{}'::jsonb) || jsonb_build_object(
        'recorded_with_supporter', true, 'supporter_user_id', actor,
        'duration_seconds', coalesce((meta_json->>'duration_seconds')::numeric, 0) + input_duration_seconds
      )
    where id = target_answer.id;
  end if;

  select count(*) + 1 into part_count from public.media_assets
  where answer_id = target_answer.id and asset_type = 'audio';
  insert into public.media_assets (
    answer_id, user_id, family_id, book_project_id, person_id, asset_type, storage_path, meta_json
  ) values (
    target_answer.id, target_project.owner_user_id, target_project.family_id,
    target_project.id, target_project.subject_person_id, 'audio', audio_path,
    jsonb_build_object('part', part_count, 'total_parts', part_count,
      'recorded_with_supporter', true, 'supporter_user_id', actor,
      'segment_id', input_answer_id, 'duration_seconds', input_duration_seconds)
  );
  update public.media_assets set meta_json = coalesce(meta_json, '{}'::jsonb) || jsonb_build_object('total_parts', part_count)
  where answer_id = target_answer.id and asset_type = 'audio';
  update public.user_questions set status = 'answered', answered_at = coalesce(answered_at, now())
  where id = target_question.id;
  return target_answer.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_supporter_questions(input_book_project_id uuid)
 RETURNS TABLE(user_question_id uuid, owner_user_id uuid, subject_person_id uuid, family_id uuid, sequence_order integer, question_id text, question_text text, chapter_title text, status text, prompt_style text, prompt_hint text, reassurance_text text, followup_hint text, min_duration_seconds integer, min_transcript_chars integer, flow_type text, onboarding_group text, answer_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
 if public.family_managed(input_book_project_id) then raise exception 'Use family workspace' using errcode='42501'; end if;
 if not exists (
 select 1
 from public.project_supporters ps
 where ps.book_project_id = input_book_project_id
 and ps.supporter_user_id = auth.uid()
 and ps.status = 'active'
 and (
 ps.can_operate_recording = true
 or ps.can_edit_book_text = true
 or ps.can_build_book = true
 )
 ) then
 raise exception 'Supporter access is not allowed';
 end if;

 return query
 select
 uq.id,
 bp.owner_user_id,
 bp.subject_person_id,
 bp.family_id,
 uq.sequence_order,
 uq.question_id::text,
 coalesce(uq.custom_question_text, uq.question_text_snapshot, ''),
 coalesce(uq.chapter_title_snapshot, uq.chapter, 'その他'),
 coalesce(uq.status, 'pending'),
 coalesce(uq.meta_json ->> 'prompt_style', ''),
 coalesce(uq.meta_json ->> 'prompt_hint', ''),
 coalesce(uq.meta_json ->> 'reassurance_text', ''),
 coalesce(uq.meta_json ->> 'followup_hint', ''),
 coalesce(nullif(uq.meta_json ->> 'min_duration_seconds', '')::integer, 25),
 coalesce(nullif(uq.meta_json ->> 'min_transcript_chars', '')::integer, 80),
 coalesce(uq.meta_json ->> 'flow_type', ''),
 coalesce(uq.meta_json ->> 'onboarding_group', ''),
 answer_row.id
 from public.user_questions uq
 join public.book_projects bp
 on bp.id = uq.book_project_id
 left join lateral (
 select a.id
 from public.answers a
 where a.book_project_id = uq.book_project_id
 and a.user_question_id = uq.id
 order by a.created_at desc
 limit 1
 ) answer_row on true
 where uq.book_project_id = input_book_project_id
 and uq.is_active = true
 order by uq.sequence_order asc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_family_story_invitation(input_claim_token text, input_book_project_id uuid, input_accept_support boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
 invitation public.family_story_invitations%rowtype;
 project_row public.book_projects%rowtype;
 inviter_person_id uuid;
 current_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
 if public.family_managed(input_book_project_id) then raise exception 'Use family workspace' using errcode='42501'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.claim_gift_order(input_claim_token text, input_book_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare gift_row public.gift_orders%rowtype;
declare order_row public.commerce_orders%rowtype;
begin
 if public.family_managed(input_book_project_id) then raise exception 'Use family workspace' using errcode='42501'; end if;
 if auth.uid() is null then raise exception 'ログインが必要です' using errcode = '42501'; end if;
 select * into gift_row from public.gift_orders where claim_token = input_claim_token for update;
 if gift_row.id is null then raise exception 'ギフトが見つかりません' using errcode = 'P0002'; end if;
 select * into order_row from public.commerce_orders where id = gift_row.commerce_order_id;
 if order_row.status not in ('paid', 'zero_paid') then raise exception 'このギフトはまだ利用できません'; end if;
 if gift_row.claimed_by_user_id is not null and gift_row.claimed_by_user_id <> auth.uid() then
 raise exception 'このギフトは受取済みです' using errcode = '22023';
 end if;
 if not exists (
 select 1 from public.book_projects where id = input_book_project_id and owner_user_id = auth.uid()
 ) then raise exception '物語を確認できません' using errcode = '42501'; end if;

 perform set_config('app.payment_flow', 'on', true);
 update public.book_projects set
 access_status = 'gifted',
 purchaser_user_id = order_row.purchaser_user_id,
 purchased_at = order_row.purchased_at,
 commerce_order_id = order_row.id
 where id = input_book_project_id and owner_user_id = auth.uid();

 update public.commerce_orders set book_project_id = input_book_project_id where id = order_row.id;
 update public.gift_orders set
 claimed_by_user_id = auth.uid(),
 claimed_at = coalesce(claimed_at, now()),
 recipient_project_id = input_book_project_id
 where id = gift_row.id;

 return jsonb_build_object('success', true, 'project_id', input_book_project_id, 'order_id', order_row.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_custom_story_question(input_book_project_id uuid, input_question_text text, input_chapter_title text, input_position text DEFAULT 'end'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
 target_project public.book_projects%rowtype;
 target_participant_id uuid;
 new_question_id text := 'CUSTOM_' || replace(gen_random_uuid()::text, '-', '');
 new_user_question_id uuid := gen_random_uuid();
 insert_sequence integer;
 catalog_sequence integer;
begin
 if public.family_managed(input_book_project_id) then raise exception 'Use family workspace' using errcode='42501'; end if;
 select * into target_project
 from public.book_projects bp
 where bp.id = input_book_project_id
 and bp.owner_user_id = auth.uid()
 and bp.status = 'active';

 if target_project.id is null then
 raise exception 'Project owner access is required';
 end if;

 if char_length(btrim(coalesce(input_question_text, ''))) < 4 then
 raise exception 'Question text is too short';
 end if;

 perform pg_advisory_xact_lock(hashtextextended(input_book_project_id::text, 0));
 lock table public.questions in share row exclusive mode;

 select pp.id into target_participant_id
 from public.project_participants pp
 where pp.book_project_id = input_book_project_id
 and pp.role = 'speaker'
 order by pp.created_at asc
 limit 1;

 if input_position = 'next' then
 select coalesce(min(uq.sequence_order), 1) into insert_sequence
 from public.user_questions uq
 where uq.book_project_id = input_book_project_id
 and uq.is_active = true
 and uq.status = 'pending'
 and coalesce(uq.meta_json ->> 'flow_type', '') = 'story';

 -- A two-step shift remains safe even when a project has a unique
 -- sequence constraint: the temporary range cannot collide with live rows.
 update public.user_questions
 set sequence_order = sequence_order + 1000000
 where book_project_id = input_book_project_id
 and sequence_order >= insert_sequence;

 update public.user_questions
 set sequence_order = sequence_order - 999999
 where book_project_id = input_book_project_id
 and sequence_order >= insert_sequence + 1000000;
 else
 select coalesce(max(uq.sequence_order), 0) + 1 into insert_sequence
 from public.user_questions uq
 where uq.book_project_id = input_book_project_id;
 end if;

 -- questions.sequence_order is catalogue-wide, whereas the ordering above
 -- belongs to one user's project. Keep the two sequences independent.
 select coalesce(max(q.sequence_order), 0) + 1 into catalog_sequence
 from public.questions q;

 insert into public.questions (
 id,
 sequence_order,
 chapter,
 content,
 is_active,
 meta_json
 ) values (
 new_question_id,
 catalog_sequence,
 coalesce(nullif(btrim(input_chapter_title), ''), '追加した問い'),
 btrim(input_question_text),
 true,
 jsonb_build_object(
 'product_brand', 'tateito_yokoito',
 'flow_type', 'story',
 'question_role', 'custom_story',
 'created_by_user_id', auth.uid()
 )
 );

 insert into public.user_questions (
 id,
 user_id,
 book_project_id,
 participant_id,
 question_id,
 sequence_order,
 chapter,
 chapter_title_snapshot,
 chapter_subtitle_snapshot,
 question_text_snapshot,
 custom_question_text,
 status,
 is_active,
 meta_json
 ) values (
 new_user_question_id,
 target_project.owner_user_id,
 target_project.id,
 target_participant_id,
 new_question_id,
 insert_sequence,
 coalesce(nullif(btrim(input_chapter_title), ''), '追加した問い'),
 coalesce(nullif(btrim(input_chapter_title), ''), '追加した問い'),
 'ご自身で追加した問い',
 btrim(input_question_text),
 btrim(input_question_text),
 'pending',
 true,
 jsonb_build_object(
 'flow_type', 'story',
 'question_role', 'custom_story',
 'is_custom', true,
 'prompt_style', 'open',
 'reassurance_text', '思い浮かぶところから、お話しください。',
 'min_duration_seconds', 25,
 'min_transcript_chars', 80
 )
 );

 return new_user_question_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_family_story_delivery_mode(input_book_project_id uuid, input_mode text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
 if public.family_managed(input_book_project_id) then raise exception 'Use family workspace' using errcode='42501'; end if;
 if auth.uid() is null then
 raise exception 'Authentication is required';
 end if;

 if input_mode not in ('manual', 'facilitator') then
 raise exception 'Unsupported delivery mode';
 end if;

 if not exists (
 select 1
 from public.book_projects bp
 join public.project_supporters ps
 on ps.book_project_id = bp.id
 and ps.supporter_user_id = auth.uid()
 and ps.status = 'active'
 where bp.id = input_book_project_id
 and bp.owner_user_id = auth.uid()
 and bp.status = 'active'
 and coalesce(bp.onboarding_preferences ->> 'support_mode', '') = 'child_led'
 ) then
 raise exception 'Family story access is not allowed';
 end if;

 update public.book_projects bp
 set
 onboarding_preferences = coalesce(bp.onboarding_preferences, '{}'::jsonb)
 || jsonb_build_object('notification_recipient', input_mode),
 updated_at = now()
 where bp.id = input_book_project_id;

 update public.project_supporters ps
 set
 meta_json = coalesce(ps.meta_json, '{}'::jsonb)
 || jsonb_build_object('notification_recipient', input_mode),
 updated_at = now()
 where ps.book_project_id = input_book_project_id
 and ps.supporter_user_id = auth.uid()
 and ps.status = 'active';

 if input_mode = 'manual' then
 update public.notification_schedules ns
 set enabled = false, updated_at = now()
 where ns.user_id = auth.uid()
 and ns.book_project_id = input_book_project_id;
 end if;

 return input_mode;
end;
$function$;

CREATE OR REPLACE FUNCTION public.respond_to_supporter_invite(input_invite_id uuid, input_accept boolean)
 RETURNS TABLE(invite_id uuid, book_project_id uuid, response_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
 current_user_id uuid := auth.uid();
 current_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
 current_person_id uuid;
 target_invite public.project_invites%rowtype;
 target_project public.book_projects%rowtype;
 target_sharing_preference_id uuid;
begin
 if exists(select 1 from public.project_invites pi where pi.id=input_invite_id and public.family_managed(pi.book_project_id)) then raise exception 'Family supporter change requires subject' using errcode='42501'; end if;
 if current_user_id is null or current_email = '' then
 raise exception 'Authentication is required';
 end if;

 select pi.*
 into target_invite
 from public.project_invites pi
 where pi.id = input_invite_id
 and pi.role = 'supporter'
 and pi.status = 'pending'
 and lower(btrim(pi.invitee_email)) = current_email
 for update;

 if not found then
 raise exception 'The invitation was not found or is not available';
 end if;

 select bp.*
 into target_project
 from public.book_projects bp
 where bp.id = target_invite.book_project_id
 and bp.status = 'active';

 if not found then
 raise exception 'The story project is not available';
 end if;

 if input_accept is not true then
 update public.project_invites
 set
 status = 'declined',
 accepted_at = null
 where id = target_invite.id;

 return query
 select target_invite.id, target_invite.book_project_id, 'declined'::text;
 return;
 end if;

 select upl.person_id
 into current_person_id
 from public.user_person_links upl
 where upl.user_id = current_user_id
 and upl.role = 'self'
 order by upl.created_at asc
 limit 1;

 insert into public.project_supporters (
 book_project_id,
 supporter_user_id,
 supporter_person_id,
 granted_by_user_id,
 status,
 can_operate_recording,
 can_manage_photos,
 can_edit_book_text,
 can_build_book,
 can_view_raw_audio,
 can_change_sharing,
 can_change_legacy,
 can_delete_story,
 revoked_at,
 meta_json
 ) values (
 target_invite.book_project_id,
 current_user_id,
 current_person_id,
 target_invite.inviter_user_id,
 'active',
 true,
 true,
 true,
 true,
 false,
 false,
 false,
 false,
 null,
 jsonb_build_object('source', 'project_invite', 'invite_id', target_invite.id)
 )
 on conflict on constraint project_supporters_project_user_unique
 do update set
 supporter_person_id = excluded.supporter_person_id,
 granted_by_user_id = excluded.granted_by_user_id,
 status = 'active',
 can_operate_recording = true,
 can_manage_photos = true,
 can_edit_book_text = true,
 can_build_book = true,
 can_view_raw_audio = false,
 can_change_sharing = false,
 can_change_legacy = false,
 can_delete_story = false,
 revoked_at = null,
 meta_json = project_supporters.meta_json || excluded.meta_json,
 updated_at = now();

 if target_invite.auto_share_on_accept then
 insert into public.story_sharing_preferences (
 book_project_id,
 owner_person_id,
 live_scope
 ) values (
 target_project.id,
 target_project.subject_person_id,
 'selected'
 )
 on conflict on constraint story_sharing_preferences_project_unique
 do nothing;

 update public.story_sharing_preferences
 set live_scope = 'selected'
 where story_sharing_preferences.book_project_id = target_project.id
 and live_scope = 'private';

 select pref.id
 into target_sharing_preference_id
 from public.story_sharing_preferences pref
 where pref.book_project_id = target_project.id;

 insert into public.story_share_recipients (
 sharing_preference_id,
 recipient_person_id,
 recipient_user_id,
 recipient_phase,
 source,
 status,
 meta_json
 ) values (
 target_sharing_preference_id,
 current_person_id,
 current_user_id,
 'live',
 'supporter',
 'active',
 jsonb_build_object('invite_id', target_invite.id)
 )
 on conflict do nothing;

 update public.story_share_recipients
 set
 recipient_person_id = coalesce(recipient_person_id, current_person_id),
 recipient_user_id = current_user_id,
 source = 'supporter',
 status = 'active',
 updated_at = now()
 where story_share_recipients.sharing_preference_id =
 target_sharing_preference_id
 and recipient_phase = 'live'
 and (
 recipient_user_id = current_user_id
 or (
 current_person_id is not null
 and recipient_person_id = current_person_id
 )
 );
 end if;

 update public.project_invites
 set
 status = 'accepted',
 accepted_at = now()
 where id = target_invite.id;

 return query
 select target_invite.id, target_invite.book_project_id, 'accepted'::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.respond_to_supporter_invite_resilient(input_invite_id uuid, input_accept boolean)
 RETURNS TABLE(invite_id uuid, book_project_id uuid, response_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
 current_user_id uuid := auth.uid();
 current_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
 target_invite public.project_invites%rowtype;
begin
 if exists(select 1 from public.project_invites pi where pi.id=input_invite_id and public.family_managed(pi.book_project_id)) then raise exception 'Family supporter change requires subject' using errcode='42501'; end if;
 if current_user_id is null or current_email = '' then
 raise exception 'Authentication is required';
 end if;

 select pi.* into target_invite
 from public.project_invites pi
 where pi.id = input_invite_id
 and pi.role = 'supporter'
 and lower(btrim(pi.invitee_email)) = current_email;

 if target_invite.id is null then
 raise exception 'The invitation was not found or is not available';
 end if;

 if target_invite.status = 'accepted' and input_accept is true and exists (
 select 1 from public.project_supporters ps
 where ps.book_project_id = target_invite.book_project_id
 and ps.supporter_user_id = current_user_id
 and ps.status = 'active'
 ) then
 return query
 select target_invite.id, target_invite.book_project_id, 'accepted'::text;
 return;
 end if;

 if target_invite.status = 'declined' and input_accept is false then
 return query
 select target_invite.id, target_invite.book_project_id, 'declined'::text;
 return;
 end if;

 if target_invite.status <> 'pending' then
 raise exception 'The invitation was already answered';
 end if;

 return query
 select response.invite_id, response.book_project_id, response.response_status
 from public.respond_to_supporter_invite(input_invite_id, input_accept) response;
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_book_cover(input_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
 select case when public.family_managed(input_project_id) then public.family_subject(input_project_id) else (select auth.uid() is not null and (
 exists (
 select 1
 from public.book_projects bp
 where bp.id = input_project_id
 and bp.owner_user_id = auth.uid()
 )
 or public.is_tateyoko_admin()
 or exists (
 select 1
 from public.project_supporters ps
 where ps.book_project_id = input_project_id
 and ps.supporter_user_id = auth.uid()
 and ps.status = 'active'
 and ps.can_build_book = true
 )
 )) end;
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_video_stories(input_book_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
 select case when public.family_managed(input_book_project_id) then public.family_subject(input_book_project_id) else (select auth.uid() is not null and exists (
 select 1
 from public.book_projects project
 where project.id = input_book_project_id
 and project.status = 'active'
 and (
 project.owner_user_id = auth.uid()
 or exists (
 select 1
 from public.project_supporters supporter
 where supporter.book_project_id = project.id
 and supporter.supporter_user_id = auth.uid()
 and supporter.status = 'active'
 and supporter.can_operate_recording = true
 )
 or exists (
 select 1
 from public.admin_users admin_user
 where admin_user.user_id = auth.uid()
 and admin_user.is_active = true
 )
 )
 )) end;
$function$;

CREATE OR REPLACE FUNCTION public.list_voice_library()
 RETURNS TABLE(publication_id uuid, public_id text, book_project_id uuid, title text, subtitle text, subject_name text, published_at timestamp with time zone, access_mode text, relationship text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select
 publication.id,
 publication.public_id,
 publication.book_project_id,
 publication.book_title,
 publication.book_subtitle,
 publication.subject_name,
 publication.published_at,
 publication.access_mode,
 case
 when public.family_subject(project.id) then 'owner'
 when not public.family_managed(project.id) and project.owner_user_id = auth.uid() then 'owner'
 when not public.family_managed(project.id) and project.purchaser_user_id = auth.uid() then 'purchased'
 when public.can_manage_book_cover(publication.book_project_id) then 'managed'
 else 'shared'
 end
 from public.voice_publications publication
 join public.book_projects project
 on project.id = publication.book_project_id
 where auth.uid() is not null
 and (not public.family_managed(project.id) or public.family_subject(project.id) or public.shared_story_recipient_can_view(project.id))
 and publication.status = 'published'
 and (
 project.owner_user_id = auth.uid()
 or project.purchaser_user_id = auth.uid()
 or public.can_manage_book_cover(publication.book_project_id)
 or public.shared_story_recipient_can_view(publication.book_project_id)
 )
 order by publication.published_at desc nulls last, publication.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.assert_experience_processing(input_project_id uuid, input_actor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
 if public.family_managed(input_project_id) then
  if not public.family_subject(input_project_id,input_actor_id) then raise exception 'Forbidden'; end if;
  if not public.experience_data_allowed(input_project_id,true) then raise exception 'Production access suspended'; end if;
  return;
 end if;
 if not exists(select 1 from book_projects p where p.id=input_project_id and p.status='active'
   and (p.owner_user_id=input_actor_id or exists(select 1 from project_supporters s where s.book_project_id=p.id
    and s.supporter_user_id=input_actor_id and s.status='active' and s.can_operate_recording))) then raise exception 'Forbidden'; end if;
 if not public.experience_data_allowed(input_project_id,true) then raise exception 'Production access suspended'; end if;
end; $function$;
CREATE OR REPLACE FUNCTION public.can_confirm_experience_intent(input_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select auth.uid() is not null and exists (
    select 1 from public.book_projects p where p.id = input_project_id and p.status = 'active'
      and (public.family_subject_or_legacy_owner(p.id,auth.uid()) or exists (
        select 1 from public.project_supporters s
        where s.book_project_id = p.id and s.supporter_user_id = auth.uid()
          and s.status = 'active' and s.can_operate_recording = true
      ))
  );
$function$;
CREATE OR REPLACE FUNCTION public.log_answer_activity_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
 insert into public.activity_logs (
 actor_user_id, subject_user_id, action, entity_type, entity_id,
 book_project_id, answer_id, source, outcome, metadata, created_at
 ) values (
 case when public.family_managed(new.book_project_id) then coalesce(auth.uid(),new.user_id) else new.user_id end,
 case when public.family_managed(new.book_project_id) then (select s.subject_user_id from public.family_subject_bindings s where s.person_id=new.subject_person_id) else new.user_id end,
 case when tg_op = 'INSERT' then 'answer_created' else 'answer_updated' end,
 'answer',
 new.id,
 new.book_project_id,
 new.id,
 'database',
 'success',
 jsonb_strip_nulls(jsonb_build_object(
 'sequence_order', new.sequence_order,
 'question_id', new.question_id,
 'user_question_id', new.user_question_id,
 'story_origin', new.meta_json ->> 'story_origin'
 )),
 case when tg_op = 'INSERT' then coalesce(new.created_at, now()) else now() end
 );
 return new;
end;
$function$;

commit;
