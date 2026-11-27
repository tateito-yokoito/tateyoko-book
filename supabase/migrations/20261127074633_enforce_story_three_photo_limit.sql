-- Keep the same three-photo rule for BOOK answers and year-ring stories.
-- Existing photos remain untouched; only a new fourth photo is rejected.
create function public.enforce_story_three_photos()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  target_question uuid;
  existing_count integer;
begin
  if tg_table_name = 'family_free_story_media' then
    if new.asset_type <> 'photo' then return new; end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('free-story-photo:' || new.story_id::text, 0));
    select count(*) into existing_count
      from public.family_free_story_media m
      where m.story_id = new.story_id and m.asset_type = 'photo';
  elsif tg_table_name = 'book_answer_photo_drafts' then
    target_question := new.user_question_id;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('book-story-photo:' || target_question::text, 0));
    select (select count(*) from public.book_answer_photo_drafts d
              where d.user_question_id = target_question and d.committed_at is null)
         + (select count(*) from public.media_assets m
              join public.answers a on a.id = m.answer_id
              where a.book_project_id = new.book_project_id
                and a.user_question_id = target_question and m.asset_type = 'photo')
      into existing_count;
  elsif tg_table_name in ('media_assets', 'family_ring_story_media') then
    if tg_table_name = 'media_assets' and to_jsonb(new)->>'asset_type' <> 'photo' then return new; end if;
    if tg_table_name = 'family_ring_story_media' and
      coalesce(to_jsonb(new)->>'asset_type',
        case when new.storage_path ~* '\.(m4a|webm|aac|mp3|wav|ogg)$'
          then 'audio' else 'photo' end) <> 'photo' then return new; end if;
    select a.user_question_id into target_question
      from public.answers a where a.id = new.answer_id;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('book-story-photo:' ||
        coalesce(target_question, new.answer_id)::text, 0));
    select (select count(*) from public.media_assets m
              where m.answer_id = new.answer_id and m.asset_type = 'photo')
         + (select count(*) from public.family_ring_story_media r
              where r.answer_id = new.answer_id
                and coalesce(to_jsonb(r)->>'asset_type',
                  case when r.storage_path ~* '\.(m4a|webm|aac|mp3|wav|ogg)$'
                    then 'audio' else 'photo' end) = 'photo')
      into existing_count;
  else
    return new;
  end if;
  if existing_count >= 3 then
    raise exception 'Too many photos' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_story_three_photos() from public, anon, authenticated;

create trigger book_answer_photo_draft_limit
  before insert on public.book_answer_photo_drafts
  for each row execute function public.enforce_story_three_photos();
create trigger book_story_photo_limit
  before insert on public.media_assets
  for each row execute function public.enforce_story_three_photos();
create trigger family_ring_story_photo_limit
  before insert on public.family_ring_story_media
  for each row execute function public.enforce_story_three_photos();
create trigger family_free_story_photo_limit
  before insert on public.family_free_story_media
  for each row execute function public.enforce_story_three_photos();
