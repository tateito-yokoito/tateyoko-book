begin;

-- A checkout freezes its reviewed source without publishing it. Failed or
-- abandoned checkouts leave the editable work manifest untouched.
create table public.book_order_work_snapshots (
  order_id uuid primary key references public.commerce_orders(id) on delete cascade,
  book_project_id uuid not null references public.book_projects(id),
  work_manifest_id uuid not null references public.book_work_manifests(id),
  work_revision integer not null,
  snapshot jsonb not null,
  source_sha256 text not null,
  created_at timestamptz not null default now()
);
create index book_order_work_snapshots_project_idx on public.book_order_work_snapshots(book_project_id);
alter table public.book_order_work_snapshots enable row level security;
revoke all on public.book_order_work_snapshots from anon, authenticated;
grant select, insert, update on public.book_order_work_snapshots to service_role;

create table public.book_production_jobs (
  order_id uuid primary key references public.commerce_orders(id) on delete cascade,
  book_project_id uuid not null references public.book_projects(id),
  work_manifest_id uuid not null references public.book_work_manifests(id),
  source_sha256 text not null,
  state text not null default 'queued' check (state in ('queued','running','ready_review','error')),
  stage text not null default 'queued',
  attempts integer not null default 0,
  lease_until timestamptz,
  publication_id uuid references public.voice_publications(id),
  public_url text,
  pdf_storage_path text,
  pdf_page_count integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index book_production_jobs_queue_idx on public.book_production_jobs(state, lease_until, created_at);
alter table public.book_production_jobs enable row level security;
revoke all on public.book_production_jobs from anon, authenticated;
grant select, insert, update on public.book_production_jobs to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('book-production','book-production',false,50000000,array['application/pdf'])
on conflict(id) do nothing;

create or replace function public.prepare_book_order_work(input_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  o public.commerce_orders%rowtype;
  w public.book_work_manifests%rowtype;
  payload jsonb;
  prepared public.book_order_work_snapshots%rowtype;
begin
  select * into o from public.commerce_orders where id=input_order_id for update;
  if o.id is null or o.order_type <> 'self' or o.book_project_id is null
    or o.status <> 'checkout_pending' then raise exception 'Invalid book checkout'; end if;
  select * into prepared from public.book_order_work_snapshots where order_id=o.id;
  if prepared.order_id is not null then return to_jsonb(prepared); end if;
  select * into w from public.book_work_manifests where book_project_id=o.book_project_id for update;
  if w.id is null or cardinality(w.answer_ids)=0 then raise exception 'Select stories before checkout'; end if;
  if exists(select 1 from unnest(w.answer_ids) x where not exists(
    select 1 from public.answers a join public.book_projects p on p.id=a.book_project_id
    where a.id=x and a.book_project_id=o.book_project_id and a.subject_person_id=p.subject_person_id
      and a.access_override is distinct from 'private_forever')) then
    raise exception 'Selected stories changed before checkout';
  end if;
  if exists(select 1 from public.video_stories where book_project_id=o.book_project_id
    and (status='processing' or metadata->>'upload_complete'='false')) then
    raise exception 'Finish video uploads before checkout';
  end if;
  if w.confirmed_at is not null then
    payload := w.snapshot;
  else
    select jsonb_build_object(
      'project',to_jsonb(p),
      'cover',o.design_snapshot,
      'subject',(select to_jsonb(s) from public.persons s where s.id=p.subject_person_id),
      'answers',(select coalesce(jsonb_agg(to_jsonb(a) order by array_position(w.answer_ids,a.id)),'[]'::jsonb)
        from public.answers a where a.id=any(w.answer_ids)),
      'questions',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb)
        from public.user_questions q where q.id in(select a.user_question_id from public.answers a where a.id=any(w.answer_ids))),
      'media',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at),'[]'::jsonb)
        from public.media_assets m where m.answer_id=any(w.answer_ids) and m.book_project_id=p.id),
      'videos',(select coalesce(jsonb_agg(to_jsonb(v) order by v.slot_order),'[]'::jsonb)
        from public.video_stories v where v.book_project_id=p.id and v.status in('ready','failed'))
    ) into payload from public.book_projects p where p.id=o.book_project_id;
  end if;
  if payload is null then raise exception 'Book source is unavailable'; end if;
  insert into public.book_order_work_snapshots(order_id,book_project_id,work_manifest_id,work_revision,snapshot,source_sha256)
  values(o.id,o.book_project_id,w.id,w.revision,payload,encode(extensions.digest(payload::text,'sha256'),'hex'))
  returning * into prepared;
  return to_jsonb(prepared);
end; $$;
revoke all on function public.prepare_book_order_work(uuid) from public,anon,authenticated;
grant execute on function public.prepare_book_order_work(uuid) to service_role;

create or replace function public.enqueue_paid_book_production() returns trigger
language plpgsql security definer set search_path=public,auth as $$
declare
  prepared public.book_order_work_snapshots%rowtype;
  work public.book_work_manifests%rowtype;
begin
  if new.status not in ('paid','zero_paid') or old.status in ('paid','zero_paid') then return new; end if;
  select * into prepared from public.book_order_work_snapshots where order_id=new.id;
  if prepared.order_id is null then return new; end if; -- Other purchases are not book-builder orders.
  select * into work from public.book_work_manifests where id=prepared.work_manifest_id for update;
  if work.confirmed_at is null then
    update public.book_work_manifests
      set snapshot=prepared.snapshot,
          answer_ids=array(select (answer->>'id')::uuid from jsonb_array_elements(prepared.snapshot->'answers') answer),
          revision=revision+1,
          confirmed_at=now(),confirmed_by=new.purchaser_user_id
      where id=work.id;
  elsif encode(extensions.digest(work.snapshot::text,'sha256'),'hex') <> prepared.source_sha256 then
    insert into public.book_production_jobs(order_id,book_project_id,work_manifest_id,source_sha256,state,stage,error_message)
    values(new.id,new.book_project_id,prepared.work_manifest_id,prepared.source_sha256,'error','snapshot_conflict',
      'A different edition was already confirmed; manual revision is required') on conflict(order_id) do nothing;
    return new;
  end if;
  insert into public.book_production_jobs(order_id,book_project_id,work_manifest_id,source_sha256)
  values(new.id,new.book_project_id,prepared.work_manifest_id,prepared.source_sha256)
  on conflict(order_id) do nothing;
  return new;
end; $$;
create trigger enqueue_paid_book_production_after_order
  after update of status on public.commerce_orders
  for each row execute function public.enqueue_paid_book_production();
revoke all on function public.enqueue_paid_book_production() from public,anon,authenticated;

-- The worker obtains one durable lease. A crashed worker can be retried later.
create or replace function public.claim_book_production_job(input_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare job public.book_production_jobs%rowtype;
begin
  update public.book_production_jobs
  set state='running',attempts=attempts+1,lease_until=now()+interval '10 minutes',updated_at=now(),error_message=null
  where order_id=input_order_id and
    attempts < 5 and stage <> 'snapshot_conflict' and
    (state in ('queued','error') or (state='running' and lease_until<now()))
  returning * into job;
  return case when job.order_id is null then null else to_jsonb(job) end;
end; $$;
revoke all on function public.claim_book_production_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_book_production_job(uuid) to service_role;

commit;
