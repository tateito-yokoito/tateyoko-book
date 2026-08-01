begin;

-- サポーター画面で、本人の非公開設定を守りながら
-- 問い・語り・本づくりの各入口を提供する。

create or replace function public.get_supporter_questions(
  input_book_project_id uuid
)
returns table (
  user_question_id uuid,
  owner_user_id uuid,
  subject_person_id uuid,
  family_id uuid,
  sequence_order integer,
  question_id text,
  question_text text,
  chapter_title text,
  status text,
  prompt_style text,
  prompt_hint text,
  reassurance_text text,
  followup_hint text,
  min_duration_seconds integer,
  min_transcript_chars integer,
  flow_type text,
  onboarding_group text,
  answer_id uuid
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
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
$$;


create or replace function public.save_supporter_recording(
  input_book_project_id uuid,
  input_user_question_id uuid,
  input_answer_id uuid,
  input_transcript_raw text,
  input_transcript_readable text,
  input_transcript_essay text,
  input_selected_style text,
  input_storage_paths text[],
  input_duration_seconds numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_project public.book_projects%rowtype;
  target_question public.user_questions%rowtype;
  saved_answer_id uuid;
  storage_path_item text;
  storage_index integer := 0;
begin
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
$$;


-- 語りを見る権限と本づくり権限のどちらでも、共有可能な本文を取得できる。
create or replace function public.get_supporter_book_stories(
  input_book_project_id uuid
)
returns table (
  answer_id uuid,
  sequence_order integer,
  book_text text,
  created_at timestamptz,
  question_id text,
  question_text text,
  chapter_title text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from public.project_supporters ps
    where ps.book_project_id = input_book_project_id
      and ps.supporter_user_id = auth.uid()
      and ps.status = 'active'
      and (
        ps.can_edit_book_text = true
        or ps.can_build_book = true
      )
  ) then
    raise exception 'Supporter access is not allowed';
  end if;

  return query
  select
    a.id,
    a.sequence_order,
    coalesce(
      nullif(a.transcript_edited, ''),
      case
        when a.selected_style = 'essay' then nullif(a.transcript_essay, '')
        else nullif(a.transcript_readable, '')
      end,
      nullif(a.transcript_readable, ''),
      nullif(a.transcript_clean, ''),
      ''
    ),
    a.created_at,
    uq.question_id::text,
    coalesce(uq.custom_question_text, uq.question_text_snapshot, ''),
    coalesce(uq.chapter_title_snapshot, uq.chapter, 'その他')
  from public.answers a
  left join public.user_questions uq
    on uq.id = a.user_question_id
  where a.book_project_id = input_book_project_id
    and coalesce(a.access_override, 'inherit') <> 'private_forever'
  order by a.sequence_order asc;
end;
$$;


create or replace function public.get_supporter_book_photos(
  input_book_project_id uuid
)
returns table (
  media_id uuid,
  answer_id uuid,
  storage_path text,
  meta_json jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from public.project_supporters ps
    where ps.book_project_id = input_book_project_id
      and ps.supporter_user_id = auth.uid()
      and ps.status = 'active'
      and (
        ps.can_manage_photos = true
        or ps.can_edit_book_text = true
        or ps.can_build_book = true
      )
  ) then
    raise exception 'Supporter access is not allowed';
  end if;

  return query
  select
    ma.id,
    ma.answer_id,
    ma.storage_path,
    ma.meta_json,
    ma.created_at
  from public.media_assets ma
  join public.answers a
    on a.id = ma.answer_id
  where a.book_project_id = input_book_project_id
    and coalesce(a.access_override, 'inherit') <> 'private_forever'
    and ma.asset_type = 'photo'
  order by ma.created_at asc;
end;
$$;


drop policy if exists photos_supporter_read on storage.objects;

create policy photos_supporter_read
on storage.objects
for select
using (
  bucket_id = 'photos'
  and exists (
    select 1
    from public.media_assets ma
    join public.answers a
      on a.id = ma.answer_id
    join public.project_supporters ps
      on ps.book_project_id = a.book_project_id
    where ma.storage_path = storage.objects.name
      and ma.asset_type = 'photo'
      and coalesce(a.access_override, 'inherit') <> 'private_forever'
      and ps.supporter_user_id = auth.uid()
      and ps.status = 'active'
      and (
        ps.can_manage_photos = true
        or ps.can_edit_book_text = true
        or ps.can_build_book = true
      )
  )
);


drop policy if exists audio_project_owner_supporter_read on storage.objects;

create policy audio_project_owner_supporter_read
on storage.objects
for select
using (
  bucket_id = 'audio'
  and exists (
    select 1
    from public.media_assets ma
    join public.answers a
      on a.id = ma.answer_id
    join public.book_projects bp
      on bp.id = a.book_project_id
    where ma.storage_path = storage.objects.name
      and ma.asset_type = 'audio'
      and (
        bp.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.project_supporters ps
          where ps.book_project_id = bp.id
            and ps.supporter_user_id = auth.uid()
            and ps.status = 'active'
            and ps.can_view_raw_audio = true
        )
      )
  )
);

revoke all on function public.get_supporter_questions(uuid) from public;
revoke all on function public.save_supporter_recording(uuid, uuid, uuid, text, text, text, text, text[], numeric) from public;

grant execute on function public.get_supporter_questions(uuid) to authenticated;
grant execute on function public.save_supporter_recording(uuid, uuid, uuid, text, text, text, text, text[], numeric) to authenticated;

commit;
