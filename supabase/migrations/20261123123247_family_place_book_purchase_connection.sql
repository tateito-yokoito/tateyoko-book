-- Reserve the existing family person for a BOOK order.  This creates no
-- duplicate person, order, payment, answer, or consent record.
create function public.family_place_book_purchase_state(input_person_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare actor uuid := auth.uid(); target public.persons%rowtype;
  existing public.book_projects%rowtype;
begin
  if actor is null or not public.family_place_access_allowed() then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  select p.* into target from public.persons p join public.families f
    on f.id=p.family_id where p.id=input_person_id and f.owner_user_id=actor;
  if target.id is null then raise exception 'Forbidden' using errcode='42501'; end if;
  if exists(select 1 from public.voice_publications v
      join public.book_projects b on b.id=v.book_project_id
      where b.subject_person_id=target.id and v.status='published') then
    return jsonb_build_object('state','purchased','person_id',target.id);
  end if;
  select * into existing from public.book_projects b
    where b.subject_person_id=target.id and b.status='active'
    order by case when b.access_status in ('paid','gifted','legacy') then 0 else 1 end,
      b.created_at desc,b.id desc limit 1;
  if existing.id is null and exists(select 1 from public.user_person_links l
      where l.person_id=target.id and l.role='self' and l.user_id<>actor) then
    return jsonb_build_object('state','subject_consent_required','person_id',target.id);
  end if;
  if existing.id is null then return jsonb_build_object('state','available','person_id',target.id); end if;
  return jsonb_build_object('state',case
      when existing.access_status in ('paid','gifted','legacy') then 'purchased'
      when existing.owner_user_id=actor and
        existing.onboarding_preferences->>'family_place_person_id'=target.id::text
        then 'reserved'
      else 'unavailable' end,
    'person_id',target.id,
    'project_id',case when existing.owner_user_id=actor and
      existing.onboarding_preferences->>'family_place_person_id'=target.id::text
      then existing.id else null end);
end $$;

create function public.family_place_prepare_book_purchase(input_person_id uuid,
  input_creation_key uuid default gen_random_uuid())
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare actor uuid := auth.uid(); target public.persons%rowtype;
  existing public.book_projects%rowtype; question_set_id uuid; result uuid;
begin
  if actor is null or not public.family_place_access_allowed() or input_creation_key is null then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(input_person_id::text));
  select p.* into target from public.persons p join public.families f
    on f.id=p.family_id where p.id=input_person_id and f.owner_user_id=actor for update of p;
  if target.id is null then raise exception 'Forbidden' using errcode='42501'; end if;
  if exists(select 1 from public.user_person_links l where l.person_id=target.id
      and l.role='self' and l.user_id<>actor) then
    raise exception 'ご本人の同意が必要です' using errcode='42501';
  end if;
  if exists(select 1 from public.voice_publications v
      join public.book_projects b on b.id=v.book_project_id
      where b.subject_person_id=target.id and v.status='published') then
    raise exception 'この人物の完成済みBOOKがあります' using errcode='23505';
  end if;
  select * into existing from public.book_projects b
    where b.subject_person_id=target.id and b.status='active'
    order by case when b.access_status in ('paid','gifted','legacy') then 0 else 1 end,
      b.created_at desc,b.id desc limit 1 for update;
  if existing.id is not null then
    if existing.owner_user_id=actor and existing.access_status not in ('paid','gifted','legacy')
      and existing.onboarding_preferences->>'family_place_person_id'=target.id::text
      then return existing.id; end if;
    raise exception 'この人物のBOOKはすでにあります' using errcode='23505';
  end if;
  select id into question_set_id from public.question_sets
    where code='tateito_yokoito_standard_v2' and is_active
    order by version desc nulls last,created_at desc limit 1;
  if question_set_id is null then raise exception 'BOOKの質問を準備できませんでした'; end if;
  insert into public.book_projects(family_id,owner_user_id,subject_person_id,
    project_type,title,status,base_question_set_id,onboarding_status,onboarding_preferences)
  values(target.family_id,actor,target.id,'koebook',target.display_name||'さんの縦糸横糸',
    'active',question_set_id,'in_progress',jsonb_build_object(
      'family_place_person_id',target.id,'creation_key',input_creation_key,
      'story_subject_mode','family','support_mode','child_led',
      'notification_recipient','manual')) returning id into result;
  return result;
end $$;

-- The checkout Edge function uses this guard for both quote and checkout.
-- The caller is service_role, but the purchaser is independently verified
-- against the authenticated JWT before this function is invoked.
create function public.family_place_checkout_guard(input_actor uuid,
  input_person_id uuid,input_project_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select input_actor is not null and exists (
    select 1 from public.family_place_early_access a
    join public.families f on f.owner_user_id=a.user_id
    join public.persons p on p.family_id=f.id
    join public.book_projects b on b.subject_person_id=p.id
      and b.family_id=f.id and b.owner_user_id=a.user_id
    where a.user_id=input_actor and p.id=input_person_id and b.id=input_project_id
      and b.status='active' and b.access_status not in ('paid','gifted','legacy')
      and b.onboarding_preferences->>'family_place_person_id'=p.id::text
  );
$$;

revoke all on function public.family_place_book_purchase_state(uuid) from public,anon;
revoke all on function public.family_place_prepare_book_purchase(uuid,uuid) from public,anon;
revoke all on function public.family_place_checkout_guard(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.family_place_book_purchase_state(uuid) to authenticated;
grant execute on function public.family_place_prepare_book_purchase(uuid,uuid) to authenticated;
grant execute on function public.family_place_checkout_guard(uuid,uuid,uuid) to service_role;

create function public.family_place_book_identity_guard()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.onboarding_preferences->>'family_place_person_id' is not null
    and (new.subject_person_id is distinct from old.subject_person_id
      or new.family_id is distinct from old.family_id
      or new.owner_user_id is distinct from old.owner_user_id
      or new.onboarding_preferences->>'family_place_person_id'
        is distinct from old.onboarding_preferences->>'family_place_person_id') then
    raise exception 'BOOKの主人公を変更できません' using errcode='42501';
  end if;
  return new;
end $$;
create trigger family_place_book_identity_guard before update of
  subject_person_id,family_id,owner_user_id,onboarding_preferences
  on public.book_projects for each row execute function public.family_place_book_identity_guard();

alter table public.commerce_v2_consultations
  add column family_place_person_id uuid references public.persons(id),
  add column family_place_project_id uuid references public.book_projects(id);
alter table public.commerce_v2_consultations
  add constraint family_place_consultation_pair check (
    (family_place_person_id is null and family_place_project_id is null)
    or (family_place_person_id is not null and family_place_project_id is not null
      and order_type='self'));

-- Paid projects are initialized only after the payment webhook/sync has
-- confirmed access.  Existing child-led helpers retain their own behavior.
create function public.family_place_initialize_paid_book(input_project_id uuid)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare actor uuid := auth.uid(); b public.book_projects%rowtype;
  facilitator_person_id uuid; speaker_participant_id uuid; supporter_id uuid;
begin
  if actor is null or not public.family_place_access_allowed() then
    raise exception 'Forbidden' using errcode='42501'; end if;
  select * into b from public.book_projects where id=input_project_id for update;
  if b.id is null or b.owner_user_id<>actor or b.purchaser_user_id is distinct from actor
    or b.access_status not in ('paid','gifted','legacy')
    or b.onboarding_preferences->>'family_place_person_id' is distinct from b.subject_person_id::text
    or not exists(select 1 from public.families f join public.persons p on p.family_id=f.id
      where f.owner_user_id=actor and p.id=b.subject_person_id and f.id=b.family_id) then
    raise exception '購入済みの作品を確認できません' using errcode='42501'; end if;
  select l.person_id into facilitator_person_id from public.user_person_links l
    where l.user_id=actor and l.role='self' and exists(select 1 from public.persons p
      where p.id=l.person_id and p.family_id=b.family_id)
    order by l.created_at,l.id limit 1;
  insert into public.project_participants(book_project_id,user_id,person_id,role,invite_status)
    select b.id,actor,facilitator_person_id,'owner','active'
    where not exists(select 1 from public.project_participants x
      where x.book_project_id=b.id and x.user_id=actor and x.role='owner');
  insert into public.project_participants(book_project_id,user_id,person_id,role,invite_status)
    select b.id,null,b.subject_person_id,'subject','active'
    where not exists(select 1 from public.project_participants x
      where x.book_project_id=b.id and x.person_id=b.subject_person_id and x.role='subject');
  select id into speaker_participant_id from public.project_participants
    where book_project_id=b.id and person_id=b.subject_person_id and role='speaker' limit 1;
  if speaker_participant_id is null then
    insert into public.project_participants(book_project_id,user_id,person_id,role,invite_status)
      values(b.id,null,b.subject_person_id,'speaker','active') returning id into speaker_participant_id;
  end if;
  select id into supporter_id from public.project_supporters
    where book_project_id=b.id and supporter_user_id=actor and status='active' limit 1;
  if supporter_id is null then
    insert into public.project_supporters(book_project_id,supporter_user_id,
      supporter_person_id,granted_by_user_id,status,can_operate_recording,
      can_manage_photos,can_edit_book_text,can_build_book,can_view_raw_audio,
      can_change_sharing,can_change_legacy,can_delete_story,meta_json)
    values(b.id,actor,facilitator_person_id,actor,'active',true,true,false,false,
      true,false,false,false,jsonb_build_object('support_role','facilitator',
        'support_mode','child_led','notification_recipient','manual'))
    returning id into supporter_id;
  end if;
  if not exists(select 1 from public.user_questions where book_project_id=b.id) then
    insert into public.user_questions(user_id,book_project_id,participant_id,question_id,
      sequence_order,chapter,chapter_title_snapshot,chapter_subtitle_snapshot,
      question_text_snapshot,status,is_active,meta_json)
    select actor,b.id,speaker_participant_id,qsi.question_id,
      row_number() over(order by qsi.sequence_order,qsi.id)::integer,
      coalesce(qsi.chapter_title_snapshot,c.label,q.chapter),
      coalesce(qsi.chapter_title_snapshot,c.label,q.chapter),
      coalesce(qsi.chapter_subtitle_snapshot,c.description,q.chapter),
      coalesce(qsi.question_text_snapshot,q.content),'pending',true,
      coalesce(qsi.meta_json,'{}'::jsonb)||jsonb_build_object(
        'question_set_id',qs.id,'question_set_code',qs.code,
        'question_set_name',qs.name,'question_set_version',qs.version,
        'question_set_item_id',qsi.id,'original_sequence_order',qsi.sequence_order,
        'prompt_style',qsi.prompt_style,'prompt_hint',qsi.prompt_hint_snapshot,
        'reassurance_text',qsi.reassurance_text_snapshot,
        'followup_hint',qsi.followup_hint_snapshot,
        'min_duration_seconds',coalesce(qsi.min_duration_seconds,25),
        'min_transcript_chars',coalesce(qsi.min_transcript_chars,80),
        'delivery_role','facilitator')
    from public.question_set_items qsi
    join public.question_sets qs on qs.id=qsi.question_set_id
    join public.questions q on q.id=qsi.question_id
    left join public.chapters c on c.id=qsi.chapter_id
    where qsi.question_set_id=b.base_question_set_id and qsi.is_active;
  end if;
  update public.book_projects bp set current_onboarding_user_question_id=(
    select uq.id from public.user_questions uq where uq.book_project_id=b.id and uq.is_active
      order by uq.sequence_order,uq.id limit 1)
    where bp.id=b.id and bp.current_onboarding_user_question_id is null;
  insert into public.story_sharing_preferences(book_project_id,owner_person_id,
    live_scope,family_sharing_enabled,selected_sharing_enabled)
    values(b.id,b.subject_person_id,'private',false,false)
    on conflict on constraint story_sharing_preferences_project_unique do nothing;
  return supporter_id;
end $$;

revoke all on function public.family_place_initialize_paid_book(uuid) from public,anon;
grant execute on function public.family_place_initialize_paid_book(uuid) to authenticated;

create function public.family_place_start_paid_book(input_project_id uuid,
  input_subject_consent_confirmed boolean)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare actor uuid := auth.uid(); b public.book_projects%rowtype;
  supporter_id uuid; subject_actor uuid;
begin
  if input_subject_consent_confirmed is distinct from true then
    raise exception 'ご本人の同意確認が必要です' using errcode='42501'; end if;
  supporter_id := public.family_place_initialize_paid_book(input_project_id);
  select * into b from public.book_projects where id=input_project_id for update;
  select l.user_id into subject_actor from public.user_person_links l
    where l.person_id=b.subject_person_id and l.role='self' limit 1;
  if subject_actor is not null and subject_actor<>actor then
    raise exception 'ご本人のアカウントによる同意が必要です' using errcode='42501'; end if;
  if subject_actor=actor then
    insert into public.family_subject_bindings(person_id,subject_user_id,initiated_by,
      claimed_at,progress_enabled,production_mode)
    values(b.subject_person_id,actor,actor,now(),true,'self')
    on conflict (person_id) do nothing;
    if not public.family_subject(b.id,actor) then
      raise exception 'ご本人の同意状態を確認できません' using errcode='42501'; end if;
  else
    perform public.family_enable(b.id,true);
    perform public.family_confirm_production_support(b.id,actor,true,'supporter');
  end if;
  return jsonb_build_object('project_id',b.id,'person_id',b.subject_person_id,
    'production_mode',case when subject_actor=actor then 'self' else 'supporter' end);
end $$;
revoke all on function public.family_place_start_paid_book(uuid,boolean) from public,anon;
grant execute on function public.family_place_start_paid_book(uuid,boolean) to authenticated;
