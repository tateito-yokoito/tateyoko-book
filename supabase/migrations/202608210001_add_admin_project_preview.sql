begin;

-- 管理画面でも利用者向けの閲覧コンポーネントをそのまま使えるよう、
-- 原稿・問い・メディアを一度に返す読み取り専用RPCを用意する。
create or replace function public.get_admin_project_preview(input_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.book_projects where id = input_project_id) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id)
  values (auth.uid(), 'view_project_preview', 'book_project', input_project_id);

  select jsonb_build_object(
    'project', (
      select jsonb_build_object(
        'id', bp.id,
        'owner_user_id', bp.owner_user_id,
        'title', bp.title,
        'subject_name', coalesce(
          nullif(to_jsonb(subject) ->> 'preferred_name', ''),
          nullif(to_jsonb(subject) ->> 'display_name', ''),
          bp.title,
          '名称未登録'
        )
      )
      from public.book_projects bp
      left join public.persons subject on subject.id = bp.subject_person_id
      where bp.id = input_project_id
    ),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_question_id', coalesce(uq.id, a.user_question_id),
        'sequence_order', a.sequence_order,
        'content', coalesce(
          nullif(uq.custom_question_text, ''),
          nullif(uq.question_text_snapshot, ''),
          nullif(q.content, ''),
          '問い ' || a.sequence_order::text
        ),
        'chapter', coalesce(
          nullif(uq.chapter_subtitle_snapshot, ''),
          nullif(uq.chapter, ''),
          nullif(q.chapter, ''),
          '物語'
        ),
        'chapter_label', coalesce(
          nullif(uq.chapter_title_snapshot, ''),
          nullif(uq.chapter, ''),
          nullif(q.chapter, ''),
          '物語'
        )
      ) order by a.sequence_order, a.created_at)
      from public.answers a
      left join public.user_questions uq on uq.id = a.user_question_id
      left join public.questions q on q.id = coalesce(uq.question_id, a.question_id)
      where a.book_project_id = input_project_id
    ), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'book_project_id', a.book_project_id,
        'user_question_id', a.user_question_id,
        'sequence_order', a.sequence_order,
        'transcript_raw', a.transcript_raw,
        'transcript_clean', a.transcript_clean,
        'transcript_readable', a.transcript_readable,
        'transcript_essay', a.transcript_essay,
        'transcript_edited', a.transcript_edited,
        'selected_style', a.selected_style,
        'ai_mirror', a.ai_mirror,
        'snippet', a.snippet,
        'meta_json', a.meta_json,
        'access_override', to_jsonb(a) ->> 'access_override',
        'created_at', a.created_at,
        'media', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ma.id,
            'answer_id', ma.answer_id,
            'asset_type', ma.asset_type,
            'storage_path', ma.storage_path,
            'meta_json', ma.meta_json,
            'created_at', ma.created_at
          ) order by ma.created_at asc)
          from public.media_assets ma
          where ma.answer_id = a.id
        ), '[]'::jsonb)
      ) order by a.sequence_order, a.created_at)
      from public.answers a
      where a.book_project_id = input_project_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_project_preview(uuid) from public;
grant execute on function public.get_admin_project_preview(uuid) to authenticated;

comment on function public.get_admin_project_preview(uuid) is
  '管理者向けの閲覧専用プレビュー。利用者向け語り・本づくり画面と同じ表示コンポーネントへ渡すデータを返す。';

commit;
