begin;

-- A written trial answer starts/renews the same retention window as a spoken
-- trial answer. Trigger only for text-only revisions: a recording still starts
-- its window when its audio asset is safely registered.
create or replace function public.record_free_trial_written_answer()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  trial_answer public.answers%rowtype;
  trial_project public.book_projects%rowtype;
  existing public.free_trial_attempts%rowtype;
  configured_days integer;
  written_at timestamptz := clock_timestamp();
begin
  select a.* into trial_answer
    from public.answers a
    join public.user_questions q on q.id = a.user_question_id
   where a.id = new.answer_id
     and q.meta_json ->> 'onboarding_group' = 'trial_experience'
     and a.transcript_raw is null
     and a.transcript_clean is null
     and a.transcript_readable is null;
  if trial_answer.id is null then return new; end if;

  select * into trial_project from public.book_projects
   where id = trial_answer.book_project_id for update;
  if trial_project.id is null
     or trial_project.access_status <> 'trial'
     or trial_answer.user_id is distinct from trial_project.owner_user_id
     or new.user_id is distinct from trial_answer.user_id then
    return new;
  end if;

  select * into existing from public.free_trial_attempts
   where book_project_id = trial_project.id for update;
  if existing.book_project_id is null then
    select retention_days into configured_days
      from public.free_trial_retention_settings where singleton = true;
    if configured_days is null then
      raise exception 'Trial retention is not configured';
    end if;
    insert into public.free_trial_attempts (
      book_project_id, account_id, retention_days, started_at,
      last_spoken_at, expires_at
    ) values (
      trial_project.id, trial_project.owner_user_id, configured_days,
      written_at, written_at, written_at + make_interval(days => configured_days)
    );
  elsif existing.status = 'active' and existing.expires_at > written_at then
    update public.free_trial_attempts
       set last_spoken_at = written_at,
           expires_at = written_at + make_interval(days => existing.retention_days),
           updated_at = written_at
     where book_project_id = existing.book_project_id;
  else
    raise exception 'Trial has expired or is being transferred'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.record_free_trial_written_answer() from public, anon, authenticated;
drop trigger if exists record_free_trial_written_answer on public.answer_text_versions;
create trigger record_free_trial_written_answer
  after insert on public.answer_text_versions for each row
  execute function public.record_free_trial_written_answer();

commit;
