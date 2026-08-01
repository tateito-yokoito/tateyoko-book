begin;

create or replace function public.supporter_can_view_shared_story(
  input_book_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.project_supporters ps
    join public.story_sharing_preferences pref
      on pref.book_project_id = ps.book_project_id
    where ps.book_project_id = input_book_project_id
      and ps.supporter_user_id = auth.uid()
      and ps.status = 'active'
      and (
        pref.live_scope = 'family'
        or (
          pref.live_scope = 'selected'
          and exists (
            select 1
            from public.story_share_recipients recipient
            where recipient.sharing_preference_id = pref.id
              and recipient.recipient_user_id = auth.uid()
              and recipient.status = 'active'
              and recipient.recipient_phase in ('live', 'both')
          )
        )
      )
  );
$$;


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

  if not public.supporter_can_view_shared_story(input_book_project_id) then
    return;
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

  if not public.supporter_can_view_shared_story(input_book_project_id) then
    return;
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
      and public.supporter_can_view_shared_story(a.book_project_id)
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
        or (
          public.supporter_can_view_shared_story(bp.id)
          and exists (
            select 1
            from public.project_supporters ps
            where ps.book_project_id = bp.id
              and ps.supporter_user_id = auth.uid()
              and ps.status = 'active'
              and ps.can_view_raw_audio = true
          )
        )
      )
  )
);

revoke all on function public.supporter_can_view_shared_story(uuid) from public;
grant execute on function public.supporter_can_view_shared_story(uuid) to authenticated;

commit;
