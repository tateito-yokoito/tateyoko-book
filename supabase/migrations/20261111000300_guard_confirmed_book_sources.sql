-- A completed BOOK is a fixed edition. Keep its source rows and stored files
-- immutable without preventing later, independent records in the same story.
begin;

create function public.guard_confirmed_book_source()
returns trigger language plpgsql security definer set search_path=public as $$
declare previous jsonb; incoming jsonb; frozen uuid;
begin
  if tg_op <> 'INSERT' then previous := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then incoming := to_jsonb(new); end if;

  if tg_table_name = 'answers' and tg_op <> 'INSERT' then
    select w.id into frozen from public.book_work_manifests w
      where w.book_project_id = (previous->>'book_project_id')::uuid
        and w.confirmed_at is not null
        and (previous->>'id')::uuid = any(w.answer_ids)
      for share;
  elsif tg_table_name = 'user_questions' and tg_op <> 'INSERT' then
    select w.id into frozen from public.book_work_manifests w
      where w.book_project_id = (previous->>'book_project_id')::uuid
        and w.confirmed_at is not null
        and exists (select 1 from jsonb_array_elements(coalesce(w.snapshot->'questions','[]'::jsonb)) q
          where q->>'id' = previous->>'id')
      for share;
  elsif tg_table_name = 'media_assets' then
    select w.id into frozen from public.book_work_manifests w
      where w.confirmed_at is not null
        and ((previous->>'answer_id')::uuid = any(w.answer_ids)
          or (incoming->>'answer_id')::uuid = any(w.answer_ids)
          or exists (select 1 from jsonb_array_elements(coalesce(w.snapshot->'media','[]'::jsonb)) m
            where m->>'id' = previous->>'id'))
      for share;
  elsif tg_table_name = 'video_stories' then
    select w.id into frozen from public.book_work_manifests w
      where w.confirmed_at is not null
        and ((previous->>'source_answer_id')::uuid = any(w.answer_ids)
          or (incoming->>'source_answer_id')::uuid = any(w.answer_ids)
          or exists (select 1 from jsonb_array_elements(coalesce(w.snapshot->'videos','[]'::jsonb)) v
            where v->>'id' = previous->>'id'))
      for share;
  elsif tg_table_name = 'book_cover_settings' then
    select w.id into frozen from public.book_work_manifests w
      where w.confirmed_at is not null
        and (w.book_project_id = (previous->>'book_project_id')::uuid
          or w.book_project_id = (incoming->>'book_project_id')::uuid)
      for share;
  elsif tg_table_name = 'theme_memory_answer_records' and tg_op <> 'INSERT' then
    select w.id into frozen from public.book_work_manifests w
      where w.confirmed_at is not null
        and exists (select 1 from jsonb_array_elements(coalesce(w.snapshot->'contributions','[]'::jsonb)) c
          where c->>'id' = previous->>'id')
      for share;
  elsif tg_table_name = 'theme_memory_requests' and tg_op <> 'INSERT' then
    select w.id into frozen from public.book_work_manifests w
      where w.confirmed_at is not null
        and exists (select 1 from jsonb_array_elements(coalesce(w.snapshot->'contributions','[]'::jsonb)) c
          where c->>'request_id' = previous->>'id')
      for share;
  end if;

  if frozen is not null then
    raise exception '完成済みBOOKの原本は変更できません' using errcode='55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_confirmed_book_source() from public,anon,authenticated;

create trigger guard_confirmed_book_answers before update or delete on public.answers
  for each row execute function public.guard_confirmed_book_source();
create trigger guard_confirmed_book_questions before update or delete on public.user_questions
  for each row execute function public.guard_confirmed_book_source();
create trigger guard_confirmed_book_media before insert or update or delete on public.media_assets
  for each row execute function public.guard_confirmed_book_source();
create trigger guard_confirmed_book_videos before insert or update or delete on public.video_stories
  for each row execute function public.guard_confirmed_book_source();
create trigger guard_confirmed_book_cover before insert or update or delete on public.book_cover_settings
  for each row execute function public.guard_confirmed_book_source();
create trigger guard_confirmed_book_contributions
  before update of request_id,question_key,source_question_id,
    responder_name,prompt_snapshot,current_text,audio_records,photo_paths,
    publication_status,consent_at,created_at or delete
  on public.theme_memory_answer_records
  for each row execute function public.guard_confirmed_book_source();
create trigger guard_confirmed_book_requests
  before update of book_project_id,theme_code,relationship_label,recipient_name,created_at or delete
  on public.theme_memory_requests for each row execute function public.guard_confirmed_book_source();

-- Storage's permissive policies are combined with OR, so a row trigger is the
-- reliable final boundary for overwrite, move and delete of frozen objects.
-- The same rule protects the bytes during a pending checkout.
create function public.guard_frozen_book_object()
returns trigger language plpgsql security definer set search_path=public,storage as $$
begin
  if (old.bucket_id in ('photos','audio','videos')
      and old.name like 'published/%')
    or (old.bucket_id in ('photos','audio','videos','memory-contributions') and (
      exists (select 1 from public.book_work_manifests w
        where w.confirmed_at is not null and w.snapshot is not null
          and jsonb_path_exists(w.snapshot,'$.** ? (@ == $path)',
            jsonb_build_object('path',old.name)))
      or exists (select 1 from public.book_order_work_snapshots s
        join public.commerce_orders o on o.id=s.order_id
        where o.status='checkout_pending'
          and o.metadata->>'order_kind'='initial_completion'
          and jsonb_path_exists(s.snapshot,'$.** ? (@ == $path)',
            jsonb_build_object('path',old.name)))))
    or (old.bucket_id='book-production' and exists (
      select 1 from public.book_ops_cases c
      where c.approved_at is not null
        and c.print_pdf_storage_path=old.name)) then
    raise exception '完成済みまたは決済中のBOOKの保存ファイルは変更できません'
      using errcode='55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_frozen_book_object() from public,anon,authenticated;
create trigger guard_frozen_book_object
  before update or delete on storage.objects
  for each row execute function public.guard_frozen_book_object();

commit;
