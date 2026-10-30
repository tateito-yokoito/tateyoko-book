begin;

-- A question has one published text. Drafts and old versions are private to its author.
alter table public.answers add column if not exists text_revision bigint not null default 0;

create table if not exists public.answer_text_drafts (
  user_id uuid not null,
  sequence_order integer not null,
  book_project_id uuid not null references public.book_projects(id),
  body text,
  base_text_revision bigint not null default 0,
  generation bigint not null default 0,
  edit_number bigint not null default 0,
  device_id uuid,
  state text not null default 'active' check (state in ('active','discarded')),
  updated_at timestamptz not null default now(),
  primary key (user_id, sequence_order),
  check (state = 'active' or body is null)
);
alter table public.answer_text_drafts enable row level security;
revoke all on public.answer_text_drafts from public, anon, authenticated;
grant select on public.answer_text_drafts to authenticated;
grant all on public.answer_text_drafts to service_role;
create policy answer_text_drafts_owner_read on public.answer_text_drafts
  for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.answer_text_versions (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answers(id) on delete cascade,
  user_id uuid not null,
  text_revision bigint not null,
  body text not null,
  reason text not null check (reason in ('initial','edit','replace','append','restore')),
  created_at timestamptz not null default now(),
  unique (answer_id, text_revision)
);
create index if not exists answer_text_versions_owner_idx
  on public.answer_text_versions(user_id, answer_id, text_revision desc);
alter table public.answer_text_versions enable row level security;
revoke all on public.answer_text_versions from public, anon, authenticated;
grant select on public.answer_text_versions to authenticated;
grant all on public.answer_text_versions to service_role;
create policy answer_text_versions_owner_read on public.answer_text_versions
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.sync_answer_text_draft(
  input_project_id uuid, input_sequence_order integer, input_generation bigint,
  input_edit_number bigint, input_expected_server_edit_number bigint,
  input_device_id uuid, input_body text,
  input_base_text_revision bigint
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  q public.user_questions%rowtype;
  a public.answers%rowtype;
  d public.answer_text_drafts%rowtype;
begin
  if uid is null or input_device_id is null or input_edit_number < 1
    or input_generation < 0 or input_body is null or length(input_body) > 100000 then
    raise exception 'Invalid text draft request';
  end if;
  select * into q from public.user_questions
    where user_id = uid and book_project_id = input_project_id
      and sequence_order = input_sequence_order and is_active is true;
  if q.id is null then raise exception 'Question unavailable'; end if;
  select * into a from public.answers
    where user_id = uid and sequence_order = input_sequence_order;
  if a.id is not null and (a.book_project_id is not null and a.book_project_id <> input_project_id
    or a.text_revision <> input_base_text_revision) then
    return jsonb_build_object('status','answer_conflict','answer_revision',a.text_revision);
  end if;
  if a.id is null and input_base_text_revision <> 0 then
    return jsonb_build_object('status','answer_conflict','answer_revision',0);
  end if;

  insert into public.answer_text_drafts
    (user_id, sequence_order, book_project_id, generation, edit_number,
     device_id, body, base_text_revision, state)
  values (uid, input_sequence_order, input_project_id, 0, 0,
          input_device_id, null, input_base_text_revision, 'discarded')
  on conflict (user_id, sequence_order) do nothing;
  select * into d from public.answer_text_drafts
    where user_id = uid and sequence_order = input_sequence_order for update;
  if d.book_project_id <> input_project_id or d.generation <> input_generation then
    return jsonb_build_object('status','generation_conflict','draft',to_jsonb(d));
  end if;
  if d.edit_number <> input_expected_server_edit_number then
    return jsonb_build_object('status','edit_conflict','draft',to_jsonb(d));
  end if;
  if d.state = 'active' and d.device_id is distinct from input_device_id then
    return jsonb_build_object('status','device_conflict','draft',to_jsonb(d));
  end if;
  if d.state = 'active' and input_edit_number <= d.edit_number then
    return jsonb_build_object('status','stale_edit','draft',to_jsonb(d));
  end if;
  update public.answer_text_drafts set
    body = input_body, base_text_revision = input_base_text_revision,
    edit_number = input_edit_number, device_id = input_device_id,
    state = 'active', updated_at = now()
    where user_id = uid and sequence_order = input_sequence_order returning * into d;
  return jsonb_build_object('status','saved','draft',to_jsonb(d));
end; $$;

create or replace function public.discard_answer_text_draft(
  input_project_id uuid, input_sequence_order integer, input_generation bigint,
  input_device_id uuid
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); d public.answer_text_drafts%rowtype;
begin
  if uid is null or input_device_id is null or input_generation < 0 or not exists (
    select 1 from public.user_questions where user_id = uid
      and book_project_id = input_project_id and sequence_order = input_sequence_order
  ) then raise exception 'Question unavailable'; end if;
  insert into public.answer_text_drafts
    (user_id, sequence_order, book_project_id, generation, edit_number,
     device_id, body, state)
  values (uid, input_sequence_order, input_project_id, 0, 0,
          input_device_id, null, 'discarded')
  on conflict (user_id, sequence_order) do nothing;
  select * into d from public.answer_text_drafts
    where user_id = uid and sequence_order = input_sequence_order for update;
  if d.book_project_id <> input_project_id or d.generation <> input_generation then
    return jsonb_build_object('status','generation_conflict','draft',to_jsonb(d));
  end if;
  if d.state = 'active' and d.device_id is distinct from input_device_id then
    return jsonb_build_object('status','device_conflict','draft',to_jsonb(d));
  end if;
  update public.answer_text_drafts set
    body = null, state = 'discarded', generation = generation + 1,
    edit_number = 0, device_id = input_device_id, updated_at = now()
    where user_id = uid and sequence_order = input_sequence_order returning * into d;
  return jsonb_build_object('status','discarded','draft',to_jsonb(d));
end; $$;

create or replace function public.save_answer_text(
  input_project_id uuid, input_sequence_order integer, input_device_id uuid,
  input_generation bigint, input_edit_number bigint,
  input_base_text_revision bigint, input_body text, input_reason text default 'edit'
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  q public.user_questions%rowtype;
  p public.book_projects%rowtype;
  a public.answers%rowtype;
  d public.answer_text_drafts%rowtype;
  old_body text;
  next_revision bigint;
begin
  if uid is null or input_device_id is null or input_body is null
    or length(btrim(input_body)) = 0 or length(input_body) > 100000
    or input_reason not in ('initial','edit','restore') then
    raise exception 'Invalid answer text';
  end if;
  select * into q from public.user_questions
    where user_id = uid and book_project_id = input_project_id
      and sequence_order = input_sequence_order and is_active is true;
  select * into p from public.book_projects where id = input_project_id;
  if q.id is null or p.id is null or p.status <> 'active'
    or (public.unpaid_trial_project(input_project_id)
      and not public.unpaid_trial_question(input_project_id,q.id)) then
    raise exception 'Question unavailable';
  end if;
  select * into d from public.answer_text_drafts
    where user_id = uid and sequence_order = input_sequence_order for update;
  if d.user_id is null or d.book_project_id <> input_project_id
    or d.state <> 'active' or d.device_id is distinct from input_device_id
    or d.generation <> input_generation or d.edit_number <> input_edit_number
    or d.body is distinct from input_body
    or d.base_text_revision <> input_base_text_revision then
    return jsonb_build_object('status','draft_conflict');
  end if;
  select * into a from public.answers
    where user_id = uid and sequence_order = input_sequence_order for update;
  if a.id is not null and (a.book_project_id is not null and a.book_project_id <> input_project_id
      or a.text_revision <> input_base_text_revision) then
    return jsonb_build_object('status','answer_conflict','answer_revision',a.text_revision);
  end if;
  if a.id is null and input_base_text_revision <> 0 then
    return jsonb_build_object('status','answer_conflict','answer_revision',0);
  end if;
  if a.id is null then
    insert into public.answers
      (user_id, book_project_id, subject_person_id, user_question_id,
       question_id, sequence_order, transcript_edited, selected_style, text_revision)
    values (uid, input_project_id, p.subject_person_id, q.id,
            q.question_id, input_sequence_order, input_body, 'readable', 1)
    returning * into a;
  else
    old_body := coalesce(a.transcript_edited, a.transcript_readable,
                         a.transcript_clean, a.transcript_raw, a.snippet, '');
    -- Legacy rows have revision zero: retain their visible text before the first edit.
    if a.text_revision = 0 and old_body <> '' then
      insert into public.answer_text_versions
        (answer_id,user_id,text_revision,body,reason)
      values (a.id,uid,0,old_body,'initial') on conflict do nothing;
    end if;
    next_revision := a.text_revision + 1;
    update public.answers set transcript_edited = input_body,
      book_project_id = coalesce(book_project_id,input_project_id),
      user_question_id = coalesce(user_question_id,q.id),
      text_revision = next_revision where id = a.id returning * into a;
  end if;
  insert into public.answer_text_versions
    (answer_id,user_id,text_revision,body,reason)
  values (a.id,uid,a.text_revision,input_body,input_reason);
  update public.user_questions set answered_at = coalesce(answered_at,now()),
    status = 'answered' where id = q.id;
  update public.answer_text_drafts set body = null, state = 'discarded',
    generation = generation + 1, edit_number = 0, updated_at = now()
    where user_id = uid and sequence_order = input_sequence_order;
  return jsonb_build_object('status','saved','answer_id',a.id,
                            'text_revision',a.text_revision,
                            'generation',input_generation + 1);
end; $$;

revoke all on function public.sync_answer_text_draft(uuid,integer,bigint,bigint,bigint,uuid,text,bigint) from public,anon,authenticated;
revoke all on function public.discard_answer_text_draft(uuid,integer,bigint,uuid) from public,anon,authenticated;
revoke all on function public.save_answer_text(uuid,integer,uuid,bigint,bigint,bigint,text,text) from public,anon,authenticated;
grant execute on function public.sync_answer_text_draft(uuid,integer,bigint,bigint,bigint,uuid,text,bigint) to authenticated;
grant execute on function public.discard_answer_text_draft(uuid,integer,bigint,uuid) to authenticated;
grant execute on function public.save_answer_text(uuid,integer,uuid,bigint,bigint,bigint,text,text) to authenticated;

commit;
