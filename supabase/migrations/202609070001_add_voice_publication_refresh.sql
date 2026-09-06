begin;

-- Replace the public snapshot in one database transaction. Source media is
-- copied before this function is called, so a failed refresh leaves the
-- currently published snapshot intact.
create or replace function public.replace_voice_publication_snapshot(
  input_publication_id uuid,
  input_expected_status text,
  input_book_title text,
  input_book_subtitle text,
  input_subject_name text,
  input_snapshot_metadata jsonb,
  input_video_assets jsonb,
  input_items jsonb,
  input_published_at timestamptz,
  input_publish boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  if jsonb_typeof(coalesce(input_snapshot_metadata, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(input_video_assets, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(input_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid publication snapshot';
  end if;

  select publication.status
  into current_status
  from public.voice_publications publication
  where publication.id = input_publication_id
  for update;

  if not found then
    raise exception 'Publication not found';
  end if;
  if current_status <> input_expected_status then
    raise exception 'Publication status changed';
  end if;
  if input_publish and current_status <> 'draft' then
    raise exception 'Only a draft publication can be published';
  end if;
  if not input_publish and current_status not in ('published', 'disabled') then
    raise exception 'Only a published or disabled publication can be updated';
  end if;

  delete from public.voice_publication_items
  where publication_id = input_publication_id;

  insert into public.voice_publication_items (
    publication_id,
    item_order,
    source_answer_id,
    chapter_title,
    question_text,
    transcript_text,
    audio_assets,
    photo_assets,
    metadata
  )
  select
    input_publication_id,
    item.item_order,
    item.source_answer_id,
    coalesce(item.chapter_title, ''),
    coalesce(item.question_text, ''),
    coalesce(item.transcript_text, ''),
    coalesce(item.audio_assets, '[]'::jsonb),
    coalesce(item.photo_assets, '[]'::jsonb),
    coalesce(item.metadata, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(input_items, '[]'::jsonb)) as item(
    item_order integer,
    source_answer_id uuid,
    chapter_title text,
    question_text text,
    transcript_text text,
    audio_assets jsonb,
    photo_assets jsonb,
    metadata jsonb
  );

  update public.voice_publications
  set
    status = case when input_publish then 'published' else current_status end,
    book_title = coalesce(input_book_title, ''),
    book_subtitle = coalesce(input_book_subtitle, ''),
    subject_name = coalesce(input_subject_name, ''),
    snapshot_schema_version = 3,
    snapshot_metadata = coalesce(input_snapshot_metadata, '{}'::jsonb),
    video_assets = coalesce(input_video_assets, '[]'::jsonb),
    published_at = input_published_at
  where id = input_publication_id;
end;
$$;

revoke all on function public.replace_voice_publication_snapshot(
  uuid, text, text, text, text, jsonb, jsonb, jsonb, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.replace_voice_publication_snapshot(
  uuid, text, text, text, text, jsonb, jsonb, jsonb, timestamptz, boolean
) to service_role;

comment on table public.voice_publications is
  'Versioned public snapshots behind stable Web-book URLs. Refreshes are performed only through the service-role snapshot replacement function.';

commit;
