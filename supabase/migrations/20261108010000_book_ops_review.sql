begin;

-- Enable only after the review-aware Worker and publication functions are
-- deployed. Until then paid orders retain the existing production flow.
create table public.book_ops_rollout (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  enabled_at timestamptz
);
insert into public.book_ops_rollout(id,enabled) values(true,false);
alter table public.book_ops_rollout enable row level security;
revoke all on public.book_ops_rollout from anon,authenticated;
grant select,update on public.book_ops_rollout to service_role;

-- A case is created only for production jobs inserted after this migration.
-- Existing published editions and their jobs are deliberately untouched.
create table public.book_ops_cases (
  order_id uuid primary key references public.commerce_orders(id),
  book_project_id uuid not null references public.book_projects(id),
  work_manifest_id uuid not null references public.book_work_manifests(id),
  status text not null default 'generating' check (status in
    ('generating','generation_error','pending_review','awaiting_customer','approved',
     'print_ready','ordered','printing','shipped','delivered')),
  current_revision_id uuid,
  proof_revision_id uuid,
  approved_revision_id uuid,
  customer_requested_at timestamptz,
  customer_replied_at timestamptz,
  customer_confirmation text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  printer_reference text,
  tracking_reference text,
  shipping_address_snapshot jsonb,
  print_spec_confirmed_at timestamptz,
  print_spec_note text,
  print_pdf_storage_path text,
  notification_sent_at timestamptz,
  notification_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.book_ops_revisions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.book_ops_cases(order_id),
  version integer not null check (version >= 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  source_sha256 text not null,
  change_kind text not null check (change_kind in ('customer_original','layout','text','cover','photo_change')),
  change_summary text not null,
  change_reason text not null,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(order_id,version),
  unique(order_id,id)
);
alter table public.book_ops_cases add constraint book_ops_current_revision_fk
  foreign key (order_id,current_revision_id) references public.book_ops_revisions(order_id,id);
alter table public.book_ops_cases add constraint book_ops_proof_revision_fk
  foreign key (order_id,proof_revision_id) references public.book_ops_revisions(order_id,id);
alter table public.book_ops_cases add constraint book_ops_approved_revision_fk
  foreign key (order_id,approved_revision_id) references public.book_ops_revisions(order_id,id);
create index book_ops_cases_queue_idx on public.book_ops_cases(status,created_at);

create table public.book_ops_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.book_ops_cases(order_id),
  event_type text not null,
  note text not null default '',
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index book_ops_events_order_idx on public.book_ops_events(order_id,created_at);
alter table public.book_ops_events enable row level security;
revoke all on public.book_ops_events from anon,authenticated;
grant select,insert on public.book_ops_events to service_role;

create or replace function public.book_ops_forbid_revision_mutation() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Book operation revisions are immutable';
end $$;
create trigger book_ops_revisions_immutable before update or delete on public.book_ops_revisions
  for each row execute function public.book_ops_forbid_revision_mutation();

create or replace function public.book_ops_new_job() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  original jsonb;
  first_revision uuid;
begin
  if not exists (select 1 from public.book_ops_rollout where id and enabled) then return new; end if;
  if new.state = 'error' then return new; end if;
  select snapshot into original from public.book_order_work_snapshots where order_id = new.order_id;
  if original is null then
    select snapshot into original from public.book_work_manifests where id = new.work_manifest_id;
  end if;
  if original is null then raise exception 'Confirmed source is missing for book operation'; end if;
  insert into public.book_ops_cases(order_id,book_project_id,work_manifest_id)
    values(new.order_id,new.book_project_id,new.work_manifest_id);
  insert into public.book_ops_revisions(order_id,version,snapshot,source_sha256,change_kind,change_summary,change_reason)
    values(new.order_id,0,original,encode(extensions.digest(original::text,'sha256'),'hex'),
      'customer_original','顧客完成確定','顧客確定時の原本') returning id into first_revision;
  update public.book_ops_cases set current_revision_id = first_revision where order_id = new.order_id;
  return new;
end $$;
create trigger book_ops_new_job_after_insert after insert on public.book_production_jobs
  for each row execute function public.book_ops_new_job();

alter table public.book_ops_cases enable row level security;
alter table public.book_ops_revisions enable row level security;
revoke all on public.book_ops_cases, public.book_ops_revisions from anon, authenticated;
grant select, insert, update on public.book_ops_cases to service_role;
grant select, insert on public.book_ops_revisions to service_role;

create or replace function public.book_ops_add_revision(
  input_order_id uuid, input_expected_revision_id uuid, input_snapshot jsonb,
  input_kind text, input_summary text, input_reason text, input_actor uuid
) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare c public.book_ops_cases%rowtype; j public.book_production_jobs%rowtype;
  next_version integer; new_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if input_kind not in ('layout','text','cover','photo_change') or nullif(trim(input_summary),'') is null
    or nullif(trim(input_reason),'') is null or jsonb_typeof(input_snapshot) <> 'object' then
    raise exception 'Invalid correction';
  end if;
  select * into c from public.book_ops_cases where order_id=input_order_id for update;
  select * into j from public.book_production_jobs where order_id=input_order_id for update;
  if c.order_id is null or c.current_revision_id <> input_expected_revision_id
    or c.status not in ('pending_review','awaiting_customer','generation_error')
    or j.state not in ('ready_review','error') then
    raise exception 'Review changed or rendering in progress';
  end if;
  select coalesce(max(version),0)+1 into next_version from public.book_ops_revisions
    where order_id=input_order_id;
  insert into public.book_ops_revisions(order_id,version,snapshot,source_sha256,
    change_kind,change_summary,change_reason,changed_by)
  values(input_order_id,next_version,input_snapshot,
    encode(extensions.digest(input_snapshot::text,'sha256'),'hex'),
    input_kind,trim(input_summary),trim(input_reason),input_actor) returning id into new_id;
  update public.book_ops_cases set current_revision_id=new_id,proof_revision_id=null,
    status='generating',customer_requested_at=null,customer_replied_at=null,
    customer_confirmation=null,updated_at=now() where order_id=input_order_id;
  update public.book_production_jobs set state='queued',stage='queued',attempts=0,
    pdf_storage_path=null,pdf_page_count=null,lease_until=null,error_message=null,
    updated_at=now() where order_id=input_order_id;
  insert into public.book_ops_events(order_id,event_type,note,actor_user_id)
    values(input_order_id,'revision',trim(input_summary)||' / '||trim(input_reason),input_actor);
  return new_id;
end $$;
revoke all on function public.book_ops_add_revision(uuid,uuid,jsonb,text,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.book_ops_add_revision(uuid,uuid,jsonb,text,text,text,uuid)
  to service_role;

create or replace function public.book_ops_mark_approved(input_order_id uuid,input_actor uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare c public.book_ops_cases%rowtype; j public.book_production_jobs%rowtype;
  p public.voice_publications%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into c from public.book_ops_cases where order_id=input_order_id for update;
  select * into j from public.book_production_jobs where order_id=input_order_id for update;
  select * into p from public.voice_publications where id=j.publication_id;
  if c.order_id is null or c.status not in ('pending_review','awaiting_customer','approved')
    or c.current_revision_id is distinct from c.proof_revision_id
    or j.state <> 'ready_review' or j.pdf_storage_path is null or p.status <> 'draft'
    or p.snapshot_metadata->>'revisionId' is distinct from c.current_revision_id::text then
    raise exception 'BOOK and Web draft are not the same reviewed revision';
  end if;
  if c.status = 'awaiting_customer' and c.customer_replied_at is null then
    raise exception 'Customer reply is still pending';
  end if;
  if c.status = 'approved' then return c.current_revision_id; end if;
  if exists (select 1 from public.book_ops_revisions changed
      where changed.order_id = input_order_id and changed.version > 0
        and changed.change_kind in ('text','cover','photo_change')) and
    (c.customer_requested_at is null or c.customer_replied_at is null
      or nullif(trim(c.customer_confirmation),'') is null) then
    raise exception 'Customer confirmation is required';
  end if;
  update public.book_ops_cases set status='approved',approved_revision_id=current_revision_id,
    approved_at=now(),approved_by=input_actor,updated_at=now() where order_id=input_order_id;
  insert into public.book_ops_events(order_id,event_type,note,actor_user_id)
    values(input_order_id,'approved','BOOKとWebブックの同一版を確認',input_actor);
  return c.current_revision_id;
end $$;
revoke all on function public.book_ops_mark_approved(uuid,uuid) from public,anon,authenticated;
grant execute on function public.book_ops_mark_approved(uuid,uuid) to service_role;

-- Draft regeneration is needed after a correction; the public URL remains
-- inaccessible until final approval. Published editions retain their guard.
create or replace function public.replace_voice_publication_snapshot(
  input_publication_id uuid, input_expected_status text, input_book_title text,
  input_book_subtitle text, input_subject_name text, input_snapshot_metadata jsonb,
  input_video_assets jsonb, input_items jsonb, input_published_at timestamptz,
  input_publish boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare current_status text;
begin
  if jsonb_typeof(coalesce(input_snapshot_metadata,'{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(input_video_assets,'[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(input_items,'[]'::jsonb)) <> 'array' then
    raise exception 'Invalid publication snapshot';
  end if;
  select status into current_status from public.voice_publications
    where id=input_publication_id for update;
  if not found then raise exception 'Publication not found'; end if;
  if current_status <> input_expected_status then raise exception 'Publication status changed'; end if;
  if input_publish and current_status <> 'draft' then
    raise exception 'Only a draft publication can be published';
  end if;
  if not input_publish and current_status not in ('draft','published','disabled') then
    raise exception 'Unsupported publication status';
  end if;
  delete from public.voice_publication_items where publication_id=input_publication_id;
  insert into public.voice_publication_items(publication_id,item_order,source_answer_id,
    chapter_title,question_text,transcript_text,audio_assets,photo_assets,metadata)
  select input_publication_id,item.item_order,item.source_answer_id,
    coalesce(item.chapter_title,''),coalesce(item.question_text,''),coalesce(item.transcript_text,''),
    coalesce(item.audio_assets,'[]'::jsonb),coalesce(item.photo_assets,'[]'::jsonb),
    coalesce(item.metadata,'{}'::jsonb)
  from jsonb_to_recordset(coalesce(input_items,'[]'::jsonb)) as item(
    item_order integer,source_answer_id uuid,chapter_title text,question_text text,
    transcript_text text,audio_assets jsonb,photo_assets jsonb,metadata jsonb);
  update public.voice_publications set
    status=case when input_publish then 'published' else current_status end,
    book_title=coalesce(input_book_title,''),book_subtitle=coalesce(input_book_subtitle,''),
    subject_name=coalesce(input_subject_name,''),snapshot_schema_version=3,
    snapshot_metadata=coalesce(input_snapshot_metadata,'{}'::jsonb),
    video_assets=coalesce(input_video_assets,'[]'::jsonb),
    published_at=case when input_publish then input_published_at else published_at end
  where id=input_publication_id;
end $$;
revoke all on function public.replace_voice_publication_snapshot(
  uuid,text,text,text,text,jsonb,jsonb,jsonb,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.replace_voice_publication_snapshot(
  uuid,text,text,text,text,jsonb,jsonb,jsonb,timestamptz,boolean) to service_role;

commit;
