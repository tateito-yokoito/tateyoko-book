begin;

-- ブラウザからは自分自身と、自分が所有する物語のイベントだけを記録できる。
-- 回答・支援操作など複数主体のイベントはsecurity definerのDBトリガーが記録する。
drop policy if exists "Users can insert own activity logs" on public.activity_logs;
create policy "Users can insert own activity logs"
on public.activity_logs
for insert
to authenticated
with check (
  actor_user_id = auth.uid()
  and coalesce(subject_user_id, actor_user_id) = auth.uid()
  and (
    book_project_id is null
    or exists (
      select 1
      from public.book_projects bp
      where bp.id = activity_logs.book_project_id
        and bp.owner_user_id = auth.uid()
    )
  )
);

commit;
