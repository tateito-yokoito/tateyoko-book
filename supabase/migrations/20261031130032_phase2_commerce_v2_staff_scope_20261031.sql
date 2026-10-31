begin;

-- Separate paid interview production from the family-supporter relationship.
create table public.commerce_v2_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.commerce_v2_consultations(id) on delete restrict,
  staff_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  check ((revoked_at is null) = (revoked_by is null))
);
create unique index commerce_v2_staff_one_active_assignment
  on public.commerce_v2_staff_assignments(consultation_id, staff_user_id)
  where revoked_at is null;
create index commerce_v2_staff_active_user
  on public.commerce_v2_staff_assignments(staff_user_id, consultation_id)
  where revoked_at is null;

create table public.commerce_v2_staff_edit_events (
  id bigint generated always as identity primary key,
  consultation_id uuid not null references public.commerce_v2_consultations(id) on delete restrict,
  book_project_id uuid not null references public.book_projects(id) on delete restrict,
  answer_id uuid not null references public.answers(id) on delete restrict,
  staff_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('create_answer', 'update_answer')),
  created_at timestamptz not null default now()
);
create index commerce_v2_staff_edit_events_case
  on public.commerce_v2_staff_edit_events(consultation_id, created_at desc);
alter table public.commerce_v2_staff_assignments enable row level security;
alter table public.commerce_v2_staff_edit_events enable row level security;
revoke all on public.commerce_v2_staff_assignments, public.commerce_v2_staff_edit_events
  from public, anon, authenticated;
grant select, insert, update on public.commerce_v2_staff_assignments to service_role;
grant select, insert on public.commerce_v2_staff_edit_events to service_role;
grant usage, select on sequence public.commerce_v2_staff_edit_events_id_seq to service_role;

-- The Edge endpoint authenticates the caller and supplies that user id. The
-- RPC still checks a live assignment, payment, consent and exact project on
-- every operation, so revocation takes effect without waiting for a JWT.
create function public.commerce_v2_staff_project(
  input_staff_user_id uuid, input_consultation_id uuid
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare project_id uuid;
begin
  select coalesce(o.book_project_id, g.recipient_project_id) into project_id
  from public.commerce_v2_consultations c
  join public.commerce_orders o on o.id = c.order_id
  left join public.gift_orders g on g.commerce_order_id = o.id
  join public.commerce_v2_staff_assignments a on a.consultation_id = c.id
  join public.admin_users u on u.user_id = a.staff_user_id
  where c.id = input_consultation_id and a.staff_user_id = input_staff_user_id
    and a.revoked_at is null and u.is_active = true and u.role in ('owner', 'operator')
    and c.status in ('paid', 'in_production') and c.production_consent_at is not null
    and o.status in ('paid', 'zero_paid') and o.pricing_version = 'v2'
    and o.production_method_v2 = 'interview_staff'
    and coalesce(o.book_project_id, g.recipient_project_id) is not null
    and not exists (select 1 from public.experience_refund_requests r where r.order_id = o.id);
  if project_id is null then
    raise exception '担当作品の制作権限を確認できません' using errcode = '42501';
  end if;
  return project_id;
end;
$$;
revoke all on function public.commerce_v2_staff_project(uuid,uuid) from public, anon, authenticated;
grant execute on function public.commerce_v2_staff_project(uuid,uuid) to service_role;

create function public.commerce_v2_staff_case(
  input_staff_user_id uuid, input_consultation_id uuid
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare project_id uuid; result jsonb;
begin
  project_id := public.commerce_v2_staff_project(input_staff_user_id, input_consultation_id);
  select jsonb_build_object(
    'projectId', project_id,
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'content', q.content,
      'sequenceOrder', q.sequence_order) order by q.sequence_order)
      from public.questions q where q.is_active = true), '[]'::jsonb),
    'answers', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'questionId', a.question_id,
      'text', coalesce(a.transcript_edited, a.transcript_raw), 'revision', a.text_revision)
      order by a.sequence_order)
      from public.answers a where a.book_project_id = project_id), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.commerce_v2_staff_case(uuid,uuid) from public, anon, authenticated;
grant execute on function public.commerce_v2_staff_case(uuid,uuid) to service_role;

create function public.save_commerce_v2_staff_answer(
  input_staff_user_id uuid, input_consultation_id uuid,
  input_question_id text, input_text text, input_answer_id uuid default null,
  input_expected_revision bigint default null
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare project_id uuid; project_row public.book_projects%rowtype;
  answer_row public.answers%rowtype; next_sequence integer; action_name text;
begin
  project_id := public.commerce_v2_staff_project(input_staff_user_id, input_consultation_id);
  if length(btrim(coalesce(input_text, ''))) not between 1 and 20000 then
    raise exception '文章の長さを確認してください' using errcode = '22023';
  end if;
  if not exists (select 1 from public.questions where id = input_question_id and is_active = true) then
    raise exception '質問を確認してください' using errcode = '22023';
  end if;
  select * into project_row from public.book_projects where id = project_id for update;
  if project_row.owner_user_id is null then
    raise exception '本人の作品アカウントを確認してください' using errcode = '22023';
  end if;
  if input_answer_id is not null then
    select * into answer_row from public.answers
      where id = input_answer_id and book_project_id = project_id and question_id = input_question_id for update;
    if answer_row.id is null or input_expected_revision is distinct from answer_row.text_revision then
      raise exception '文章が更新されています。読み直してから保存してください' using errcode = '40001';
    end if;
    update public.answers set transcript_edited = btrim(input_text),
      transcript_readable = btrim(input_text), selected_style = 'readable',
      text_revision = text_revision + 1 where id = answer_row.id;
    action_name := 'update_answer';
  else
    if exists (select 1 from public.answers where book_project_id = project_id
      and question_id = input_question_id) then
      raise exception 'この質問には回答があります。既存の文章を編集してください' using errcode = '23505';
    end if;
    perform pg_advisory_xact_lock(hashtext(project_row.owner_user_id::text));
    select coalesce(max(sequence_order), 0) + 1 into next_sequence
      from public.answers where user_id = project_row.owner_user_id;
    insert into public.answers(user_id, question_id, sequence_order, transcript_raw,
      transcript_edited, transcript_readable, selected_style, book_project_id, subject_person_id)
    values (project_row.owner_user_id, input_question_id, next_sequence, btrim(input_text),
      btrim(input_text), btrim(input_text), 'readable', project_id, project_row.subject_person_id)
    returning * into answer_row;
    action_name := 'create_answer';
  end if;
  insert into public.commerce_v2_staff_edit_events(
    consultation_id, book_project_id, answer_id, staff_user_id, action)
  values (input_consultation_id, project_id, answer_row.id, input_staff_user_id, action_name);
  return answer_row.id;
end;
$$;
revoke all on function public.save_commerce_v2_staff_answer(uuid,uuid,text,text,uuid,bigint)
  from public, anon, authenticated;
grant execute on function public.save_commerce_v2_staff_answer(uuid,uuid,text,text,uuid,bigint)
  to service_role;

commit;
