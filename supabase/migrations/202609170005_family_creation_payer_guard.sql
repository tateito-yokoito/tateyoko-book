-- Do not assign Payer before a purchase. The payment finalizer sets it;
-- the existing payment-flow trigger intentionally rejects client assignment.
-- Existing projects/orders/payers are not touched.
begin;
-- One Account can operate its own and a parent's project. Question identity
-- and order are project-scoped, not globally unique across that Account.
-- Keep unassigned legacy rows unique without moving or deleting any row.
do $$ begin
 if exists(select 1 from user_questions where book_project_id is not null group by book_project_id,question_id having count(*)>1)
 or exists(select 1 from user_questions where book_project_id is not null group by book_project_id,sequence_order having count(*)>1) then
  raise exception 'Question duplicates require manual review';
 end if;
end $$;
alter table public.user_questions drop constraint if exists user_questions_user_id_sequence_order_key;
alter table public.user_questions drop constraint if exists user_questions_user_id_question_id_key;
create unique index family_questions_project_sequence on public.user_questions(book_project_id,sequence_order);
create unique index family_questions_project_question on public.user_questions(book_project_id,question_id);
create unique index family_questions_unassigned_sequence on public.user_questions(user_id,sequence_order) where book_project_id is null;
create unique index family_questions_unassigned_question on public.user_questions(user_id,question_id) where book_project_id is null;
CREATE OR REPLACE FUNCTION public.create_child_led_family_story(input_subject_name text, input_relationship_label text DEFAULT 'parent'::text, input_creation_key uuid DEFAULT gen_random_uuid())
 RETURNS TABLE(book_project_id uuid, subject_person_id uuid, subject_name text, supporter_id uuid, project_title text, created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
 current_user_id uuid := auth.uid();
 normalized_name text := nullif(btrim(input_subject_name), '');
 target_family public.families%rowtype;
 facilitator_person_id uuid;
 target_person public.persons%rowtype;
 target_project public.book_projects%rowtype;
 question_set public.question_sets%rowtype;
 speaker_participant_id uuid;
 target_supporter_id uuid;
 existing_project_id uuid;
begin
 if current_user_id is null then
 raise exception 'Authentication is required';
 end if;

 if normalized_name is null or char_length(normalized_name) > 80 then
 raise exception 'A subject name between 1 and 80 characters is required';
 end if;

 if coalesce(input_relationship_label, '') not in (
 'parent', 'spouse', 'sibling', 'grandparent', 'child', 'other'
 ) then
 raise exception 'Unsupported relationship';
 end if;

 select bp.id
 into existing_project_id
 from public.book_projects bp
 where bp.owner_user_id = current_user_id
 and bp.status = 'active'
 and bp.onboarding_preferences ->> 'creation_key' = input_creation_key::text
 limit 1;

 if existing_project_id is not null then
 return query
 select
 bp.id,
 bp.subject_person_id,
 coalesce(p.preferred_name, p.display_name),
 ps.id,
 bp.title,
 false
 from public.book_projects bp
 join public.persons p on p.id = bp.subject_person_id
 join public.project_supporters ps
 on ps.book_project_id = bp.id
 and ps.supporter_user_id = current_user_id
 and ps.status = 'active'
 where bp.id = existing_project_id;
 return;
 end if;

 select f.*
 into target_family
 from public.families f
 where f.owner_user_id = current_user_id
 order by f.created_at, f.id
 limit 1;

 if target_family.id is null then
 insert into public.families (owner_user_id, name)
 values (current_user_id, '家族の物語')
 returning * into target_family;
 end if;

 select upl.person_id
 into facilitator_person_id
 from public.user_person_links upl
 where upl.user_id = current_user_id
 and upl.role = 'self'
 order by upl.created_at, upl.id
 limit 1;

 if facilitator_person_id is null then
 raise exception 'Your profile person was not found';
 end if;

 select qs.*
 into question_set
 from public.question_sets qs
 where qs.code = 'tateito_yokoito_standard_v2'
 and qs.is_active = true
 order by qs.version desc nulls last, qs.created_at desc
 limit 1;

 if question_set.id is null then
 raise exception 'The question set was not found';
 end if;

 insert into public.persons (
 family_id,
 display_name,
 preferred_name,
 notes
 ) values (
 target_family.id,
 normalized_name,
 normalized_name,
 format('進行役との関係: %s', input_relationship_label)
 )
 returning * into target_person;

 insert into public.book_projects (
 family_id,
 owner_user_id,
 subject_person_id,
 project_type,
 title,
 status,
 base_question_set_id,
 onboarding_status,
 onboarding_preferences
 ) values (
 target_family.id,
 current_user_id,
 target_person.id,
 'koebook',
 normalized_name || 'さんの縦糸横糸',
 'active',
 question_set.id,
 'in_progress',
 jsonb_build_object(
 'creation_key', input_creation_key,
 'story_subject_mode', 'family',
 'support_mode', 'child_led',
 'notification_recipient', 'manual',
 'relationship_label', input_relationship_label
 )
 )
 returning * into target_project;

 insert into public.project_participants (
 book_project_id,
 user_id,
 person_id,
 role,
 invite_status
 ) values (
 target_project.id,
 current_user_id,
 facilitator_person_id,
 'owner',
 'active'
 );

 insert into public.project_participants (
 book_project_id,
 user_id,
 person_id,
 role,
 invite_status
 ) values (
 target_project.id,
 null,
 target_person.id,
 'subject',
 'active'
 );

 insert into public.project_participants (
 book_project_id,
 user_id,
 person_id,
 role,
 invite_status
 ) values (
 target_project.id,
 null,
 target_person.id,
 'speaker',
 'active'
 )
 returning id into speaker_participant_id;

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
 meta_json
 ) values (
 target_project.id,
 current_user_id,
 facilitator_person_id,
 current_user_id,
 'active',
 true,
 true,
 true,
 true,
 true,
 true,
 false,
 false,
 jsonb_build_object(
 'support_role', 'facilitator',
 'support_mode', 'child_led',
 'notification_recipient', 'manual'
 )
 )
 returning id into target_supporter_id;

 insert into public.user_questions (
 user_id,
 book_project_id,
 participant_id,
 question_id,
 sequence_order,
 chapter,
 chapter_title_snapshot,
 chapter_subtitle_snapshot,
 question_text_snapshot,
 status,
 is_active,
 meta_json
 )
 select
 current_user_id,
 target_project.id,
 speaker_participant_id,
 qsi.question_id,
 row_number() over (order by qsi.sequence_order, qsi.id)::integer,
 coalesce(qsi.chapter_title_snapshot, chapter.label, question.chapter),
 coalesce(qsi.chapter_title_snapshot, chapter.label, question.chapter),
 coalesce(qsi.chapter_subtitle_snapshot, chapter.description, question.chapter),
 coalesce(qsi.question_text_snapshot, question.content),
 'pending',
 true,
 coalesce(qsi.meta_json, '{}'::jsonb) || jsonb_build_object(
 'question_set_id', question_set.id,
 'question_set_code', question_set.code,
 'question_set_name', question_set.name,
 'question_set_version', question_set.version,
 'question_set_item_id', qsi.id,
 'original_sequence_order', qsi.sequence_order,
 'prompt_style', qsi.prompt_style,
 'prompt_hint', qsi.prompt_hint_snapshot,
 'reassurance_text', qsi.reassurance_text_snapshot,
 'followup_hint', qsi.followup_hint_snapshot,
 'min_duration_seconds', coalesce(qsi.min_duration_seconds, 25),
 'min_transcript_chars', coalesce(qsi.min_transcript_chars, 80),
 'delivery_role', 'facilitator'
 )
 from public.question_set_items qsi
 join public.questions question on question.id = qsi.question_id
 left join public.chapters chapter on chapter.id = qsi.chapter_id
 where qsi.question_set_id = question_set.id
 and qsi.is_active = true
 order by qsi.sequence_order, qsi.id;

 update public.book_projects bp
 set
 current_onboarding_user_question_id = first_question.id,
 onboarding_started_at = now(),
 updated_at = now()
 from lateral (
 select uq.id
 from public.user_questions uq
 where uq.book_project_id = target_project.id
 and uq.is_active = true
 order by uq.sequence_order, uq.id
 limit 1
 ) first_question
 where bp.id = target_project.id;

 insert into public.story_sharing_preferences (
 book_project_id,
 owner_person_id,
 live_scope,
 family_sharing_enabled,
 selected_sharing_enabled
 ) values (
 target_project.id,
 target_person.id,
 'private',
 false,
 false
 )
 on conflict on constraint story_sharing_preferences_project_unique do nothing;

 return query
 select
 target_project.id,
 target_person.id,
 normalized_name,
 target_supporter_id,
 target_project.title,
 true;
end;
$function$;
commit;
