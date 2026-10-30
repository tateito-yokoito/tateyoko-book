begin;

-- TEST parity with the existing production reservation contract. No production DDL.
create table if not exists public.trial_audio_upload_permits (
  project_id uuid not null references public.book_projects(id) on delete cascade,
  answer_id uuid not null,
  question_id uuid not null references public.user_questions(id),
  actor_id uuid not null,
  expires_at timestamptz not null,
  primary key (project_id, answer_id)
);
alter table public.trial_audio_upload_permits enable row level security;
revoke all on public.trial_audio_upload_permits from public, anon, authenticated;
grant all on public.trial_audio_upload_permits to service_role;

create or replace function public.unpaid_trial_project(input_project_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from book_projects p where p.id=input_project_id
      and (p.access_status='refunded' or (
        p.access_status in ('trial','checkout_pending')
        and not exists (select 1 from commerce_orders o where o.book_project_id=p.id
          and o.status in ('paid','zero_paid') and o.includes_base_book)
        and not exists (select 1 from experience_contracts c where c.book_project_id=p.id
          and c.payment_confirmed_at is not null and c.refund_confirmed_at is null)
      ))
  );
$$;
revoke all on function public.unpaid_trial_project(uuid) from public,anon,authenticated;
grant execute on function public.unpaid_trial_project(uuid) to service_role;

create or replace function public.unpaid_trial_question(input_project_id uuid,input_question_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from user_questions q where q.id=input_question_id
      and q.book_project_id=input_project_id and (
        q.id in (select tq.id from user_questions tq where tq.book_project_id=input_project_id
          and tq.meta_json->>'onboarding_group'='trial_experience'
          order by tq.sequence_order,tq.id limit 3)
        or (q.sequence_order between 1 and 3 and not exists (
          select 1 from user_questions tq where tq.book_project_id=input_project_id
            and tq.meta_json->>'onboarding_group'='trial_experience'))
      )
  );
$$;
revoke all on function public.unpaid_trial_question(uuid,uuid) from public,anon,authenticated;
grant execute on function public.unpaid_trial_question(uuid,uuid) to service_role;

create or replace function public.reserve_recording_audio_upload(
  input_project_id uuid,input_question_id uuid,input_answer_id uuid
) returns void language plpgsql security definer set search_path=public,auth as $$
begin
  if auth.uid() is null
    or not exists (select 1 from book_projects p where p.id=input_project_id and p.status='active'
      and (p.owner_user_id=auth.uid() or exists (
        select 1 from project_supporters s where s.book_project_id=p.id
          and s.supporter_user_id=auth.uid() and s.status='active'
          and s.can_operate_recording)))
    or not exists (select 1 from user_questions q where q.id=input_question_id
      and q.book_project_id=input_project_id)
    or exists (select 1 from answers a where a.id=input_answer_id
      and (a.book_project_id is distinct from input_project_id
        or a.user_question_id is distinct from input_question_id))
    or (public.unpaid_trial_project(input_project_id)
      and not public.unpaid_trial_question(input_project_id,input_question_id)) then
    raise exception 'この問いの音声は保存できません' using errcode='42501';
  end if;
  insert into public.trial_audio_upload_permits(project_id,answer_id,question_id,actor_id,expires_at)
  values(input_project_id,input_answer_id,input_question_id,auth.uid(),now()+interval '1 hour')
  on conflict(project_id,answer_id) do update set expires_at=excluded.expires_at
    where trial_audio_upload_permits.question_id=excluded.question_id
      and trial_audio_upload_permits.actor_id=excluded.actor_id;
  if not found then raise exception '音声の保存先が一致しません' using errcode='42501'; end if;
end; $$;
revoke all on function public.reserve_recording_audio_upload(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_recording_audio_upload(uuid,uuid,uuid) to authenticated;

commit;
