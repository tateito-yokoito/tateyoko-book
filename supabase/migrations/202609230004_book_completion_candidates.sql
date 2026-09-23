begin;
create table public.book_completion_rollout (
 singleton boolean primary key default true check(singleton),enabled boolean not null default false
);
insert into public.book_completion_rollout(singleton,enabled) values(true,false);
alter table public.book_completion_rollout enable row level security;
revoke all on public.book_completion_rollout from public,anon,authenticated;
grant select,update on public.book_completion_rollout to service_role;
-- An order candidate is not a completed work. No legacy rows are backfilled.
create table public.book_completion_candidates (
 id uuid primary key default gen_random_uuid(),
 book_project_id uuid not null references public.book_projects(id),
 work_manifest_id uuid not null references public.book_work_manifests(id),
 requested_by uuid not null references auth.users(id),
 expected_revision integer not null,
 snapshot jsonb not null,
 qr_in_book boolean not null,
 pin_hash text,
 state text not null default 'prepared' check(state in('prepared','checkout','completed','cancelled')),
 publication_id uuid references public.voice_publications(id),
 order_id uuid unique references public.commerce_orders(id),
 media_ready_at timestamptz,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 cancelled_at timestamptz,
 check((state='completed')=(completed_at is not null))
);
create unique index one_active_book_completion on public.book_completion_candidates(book_project_id)
 where state in('prepared','checkout','completed');
alter table public.book_completion_candidates enable row level security;
revoke all on public.book_completion_candidates from public,anon,authenticated;
grant select,insert,update on public.book_completion_candidates to service_role;

-- Defense in depth: legacy disable/resume or publish handlers cannot expose an
-- unpaid order candidate. Completion and sharing are separate transitions.
create function public.guard_book_completion_publication() returns trigger
language plpgsql security definer set search_path=public,auth as $$
begin
 if new.status<>'draft' and exists(select 1 from book_completion_candidates where publication_id=new.id) then
   if not exists(select 1 from book_completion_candidates c where c.publication_id=new.id and
     (c.state='completed' or (c.state='checkout' and new.status='published' and c.media_ready_at is not null
       and exists(select 1 from commerce_orders o where o.id=c.order_id and o.status in('paid','zero_paid'))
       and exists(select 1 from book_work_manifests w where w.id=c.work_manifest_id and w.confirmed_at is not null)))) then
     raise exception 'Complete the paid order before sharing';
   end if;
 end if;
 return new;
end; $$;
create trigger completion_publication_guard before update on public.voice_publications
 for each row execute function public.guard_book_completion_publication();
revoke all on function public.guard_book_completion_publication() from public,anon,authenticated;

create function public.get_book_completion(input_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare c book_completion_candidates%rowtype; public_id text;
begin
 if auth.uid() is null or public.can_manage_book_cover(input_project_id) is distinct from true then raise exception 'Forbidden'; end if;
 select * into c from book_completion_candidates where book_project_id=input_project_id and state in('prepared','checkout','completed');
 if c.id is null then return null; end if;
 select p.public_id into public_id from voice_publications p where p.id=c.publication_id;
 return jsonb_build_object('id',c.id,'state',c.state,'qr_in_book',c.qr_in_book,'pin_enabled',c.pin_hash is not null,
   'public_id',public_id,'completed_at',c.completed_at,
   'shipping_address',(select o.shipping_address from commerce_orders o where o.id=c.order_id));
end; $$;

create function public.guard_pending_book_completion() returns trigger
language plpgsql security definer set search_path=public,auth as $$
declare pid uuid; c book_completion_candidates%rowtype;
begin
 if tg_op='UPDATE' and old.book_project_id is distinct from new.book_project_id then
   perform 1 from book_projects where id in(old.book_project_id,new.book_project_id) order by id for update;
   if exists(select 1 from book_completion_candidates where book_project_id=old.book_project_id and state in('prepared','checkout')) then
     raise exception 'Cancel the pending order before editing';
   end if;
 end if;
 pid:=case when tg_op='DELETE' then old.book_project_id else new.book_project_id end;
 perform 1 from book_projects where id=pid for update;
 select * into c from book_completion_candidates where book_project_id=pid and state in('prepared','checkout');
 if c.id is not null then
   -- Only the verified paid-order finalizer may write the immutable manifest.
   if tg_table_name='book_work_manifests' and tg_op='UPDATE' then
     if auth.role()='service_role' and new.id=c.work_manifest_id and old.confirmed_at is null and new.confirmed_at is not null and new.snapshot=c.snapshot
       and exists(select 1 from commerce_orders where id=c.order_id and status in('paid','zero_paid')) then return new; end if;
   end if;
   raise exception 'Cancel the pending order before editing';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
create trigger pending_completion_answers before insert or update or delete on public.answers for each row execute function public.guard_pending_book_completion();
create trigger pending_completion_media before insert or update or delete on public.media_assets for each row execute function public.guard_pending_book_completion();
create trigger pending_completion_cover before insert or update or delete on public.book_cover_settings for each row execute function public.guard_pending_book_completion();
create trigger pending_completion_work before insert or update or delete on public.book_work_manifests for each row execute function public.guard_pending_book_completion();
create trigger pending_completion_video before insert or update or delete on public.video_stories for each row execute function public.guard_pending_book_completion();

create function public.prepare_book_completion(input_project_id uuid,input_expected_revision integer,
 input_qr_in_book boolean,input_pin text,input_subject_confirmed boolean) returns jsonb
language plpgsql security definer set search_path=public,auth,extensions as $$
declare w book_work_manifests%rowtype; c book_completion_candidates%rowtype; payload jsonb; pin text:=coalesce(input_pin,'');
begin
 if auth.uid() is null or public.can_manage_book_cover(input_project_id) is distinct from true
 or input_subject_confirmed is distinct from true then raise exception 'Subject confirmation required'; end if;
 perform public.assert_experience_processing(input_project_id,auth.uid());
 if not exists(select 1 from book_completion_rollout where singleton and enabled) then raise exception 'Completion is not enabled'; end if;
 if input_qr_in_book is null or (pin<>'' and pin !~ '^[0-9]{4}$') then raise exception 'Invalid QR or PIN setting'; end if;
 perform 1 from book_projects where id=input_project_id for update;
 select * into w from book_work_manifests where book_project_id=input_project_id for update;
 if w.id is null then raise exception 'Save selection first'; end if;
 if w.confirmed_at is not null then raise exception 'Existing confirmed work must be preserved'; end if;
 select * into c from book_completion_candidates where book_project_id=input_project_id and state in('prepared','checkout','completed') for update;
 if c.id is not null then
   -- A retry never changes the frozen order content or PIN behind an open Checkout.
   if c.requested_by<>auth.uid() or c.expected_revision<>input_expected_revision
     or c.qr_in_book<>input_qr_in_book
     or (c.pin_hash is null)<>(pin='')
     or (c.pin_hash is not null and crypt(pin,c.pin_hash)<>c.pin_hash)
   then raise exception 'Cancel the pending order before changing its contents'; end if;
   return jsonb_build_object('id',c.id,'state',c.state,'qr_in_book',c.qr_in_book);
 end if;
 if w.revision is distinct from input_expected_revision or cardinality(w.answer_ids)=0 then raise exception 'Review the selected stories'; end if;
 if exists(select 1 from unnest(w.answer_ids) x where not exists(select 1 from answers a join book_projects p on p.id=a.book_project_id
   where a.id=x and a.book_project_id=p.id and p.id=input_project_id and a.subject_person_id=p.subject_person_id
   and a.access_override is distinct from 'private_forever')) then raise exception 'Selection no longer available'; end if;
 if exists(select 1 from video_stories where book_project_id=input_project_id and (status='processing' or metadata->>'upload_complete'='false')) then raise exception 'Finish video uploads first'; end if;
 select jsonb_build_object(
  'project',to_jsonb(p),'cover',(select to_jsonb(s) from book_cover_settings s where s.book_project_id=p.id),
  'subject',(select to_jsonb(s) from persons s where s.id=p.subject_person_id),
  'answers',(select coalesce(jsonb_agg(to_jsonb(a) order by array_position(w.answer_ids,a.id)),'[]') from answers a where a.id=any(w.answer_ids)),
  'questions',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') from user_questions q where q.book_project_id=p.id and q.id in(select user_question_id from answers where id=any(w.answer_ids))),
  'media',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]') from media_assets m where m.book_project_id=p.id and m.answer_id=any(w.answer_ids)),
  'videos',(select coalesce(jsonb_agg(to_jsonb(v) order by v.slot_order),'[]') from video_stories v where v.book_project_id=p.id and v.source_answer_id=any(w.answer_ids) and v.status='ready'),
  'web_intro',public.web_book_intro(p.id)
 ) into payload from book_projects p where p.id=input_project_id;
 insert into book_completion_candidates(book_project_id,work_manifest_id,requested_by,expected_revision,snapshot,qr_in_book,pin_hash)
 values(input_project_id,w.id,auth.uid(),w.revision,payload,input_qr_in_book,case when pin='' then null else crypt(pin,gen_salt('bf',10)) end) returning * into c;
 return jsonb_build_object('id',c.id,'state',c.state,'qr_in_book',c.qr_in_book);
end; $$;

-- Called only after every immutable media copy and the draft publication are ready.
create function public.seal_book_completion_media(input_candidate_id uuid,input_publication_id uuid) returns void
language plpgsql security definer set search_path=public,auth as $$
declare c book_completion_candidates%rowtype; p voice_publications%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
 select * into c from book_completion_candidates where id=input_candidate_id for update;
 select * into p from voice_publications where id=input_publication_id for update;
 if c.id is null or c.state<>'prepared' or p.id is null or p.status<>'draft'
 or p.book_project_id<>c.book_project_id or p.work_manifest_id is distinct from c.work_manifest_id
 or p.snapshot_metadata->>'completionCandidateId' is distinct from c.id::text
 then raise exception 'Publication is not the prepared order candidate'; end if;
 update book_completion_candidates set publication_id=p.id,media_ready_at=coalesce(media_ready_at,now()) where id=c.id;
end; $$;

create function public.bind_book_completion_order(input_candidate_id uuid,input_order_id uuid) returns void
language plpgsql security definer set search_path=public,auth as $$
declare c book_completion_candidates%rowtype; o commerce_orders%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
 select * into o from commerce_orders where id=input_order_id for update;
 perform 1 from book_projects where id=o.book_project_id for update;
 select * into c from book_completion_candidates where id=input_candidate_id for update;
 if c.id is null or o.id is null or o.book_project_id<>c.book_project_id or o.purchaser_user_id<>c.requested_by
   or o.order_type<>'self' or o.status<>'checkout_pending' or c.media_ready_at is null
   or c.state not in('prepared','checkout') or (c.order_id is not null and c.order_id<>o.id)
 then raise exception 'Invalid completion order'; end if;
 -- Linking must be performed only by the server's validated book_builder path.
 update book_completion_candidates set order_id=o.id,state='checkout' where id=c.id;
end; $$;

create function public.complete_book_order(input_order_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare c book_completion_candidates%rowtype; o commerce_orders%rowtype; w book_work_manifests%rowtype; p voice_publications%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
 -- Same locking order as payment completion: order first, then project and work.
 select * into o from commerce_orders where id=input_order_id for update;
 perform 1 from book_projects where id=o.book_project_id for update;
 select * into c from book_completion_candidates where order_id=input_order_id for update;
 if c.id is null then return jsonb_build_object('applicable',false); end if;
 if o.status not in('paid','zero_paid') then raise exception 'Payment is not complete'; end if;
 if c.state='completed' then return jsonb_build_object('applicable',true,'completed',true,'publication_id',c.publication_id); end if;
 if c.state<>'checkout' or c.media_ready_at is null then raise exception 'Completion candidate is not ready'; end if;
 select * into p from voice_publications where id=c.publication_id for update;
 if p.status is distinct from 'draft' or p.snapshot_metadata->>'completionCandidateId' is distinct from c.id::text then raise exception 'Prepared publication changed'; end if;
 select * into w from book_work_manifests where id=c.work_manifest_id for update;
 if w.confirmed_at is not null or w.revision<>c.expected_revision then raise exception 'Work changed before completion'; end if;
 update book_work_manifests set snapshot=c.snapshot,confirmed_at=now(),confirmed_by=c.requested_by where id=w.id;
 update voice_publications set status='published',published_at=now(),access_mode=case when c.pin_hash is null then 'link' else 'code' end,
   access_code_hash=c.pin_hash,access_code_changed_at=now() where id=p.id;
 update book_completion_candidates set state='completed',completed_at=now() where id=c.id;
 return jsonb_build_object('applicable',true,'completed',true,'publication_id',p.id);
end; $$;

create function public.create_book_completion_order(input_candidate_id uuid,input_purchaser_user_id uuid,
 input_discount_code text,input_standard_extra_copy_count integer,input_premium_copy_count integer,
 input_include_gift_package boolean,input_shipping_address jsonb) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare c book_completion_candidates%rowtype; result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
 select * into c from book_completion_candidates where id=input_candidate_id;
 perform 1 from book_projects where id=c.book_project_id for update;
 select * into c from book_completion_candidates where id=input_candidate_id for update;
 if c.id is null or c.requested_by<>input_purchaser_user_id or c.state<>'prepared' or c.media_ready_at is null or c.order_id is not null then
   raise exception 'Order already started or candidate unavailable';
 end if;
 result:=public.create_book_commerce_order(input_purchaser_user_id,c.book_project_id,input_discount_code,
   input_standard_extra_copy_count,input_premium_copy_count,input_include_gift_package,input_shipping_address);
 update book_completion_candidates set order_id=(result->'order'->>'id')::uuid,state='checkout' where id=c.id;
 return result;
end; $$;

-- Used only after a server-verified Stripe expiration/cancellation, never a return URL.
create function public.cancel_book_completion(input_candidate_id uuid) returns void
language plpgsql security definer set search_path=public,auth as $$
declare c book_completion_candidates%rowtype; o commerce_orders%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
 select * into c from book_completion_candidates where id=input_candidate_id;
 if c.order_id is not null then select * into o from commerce_orders where id=c.order_id for update; end if;
 perform 1 from book_projects where id=c.book_project_id for update;
 select * into c from book_completion_candidates where id=input_candidate_id for update;
 if c.id is null then raise exception 'Not found'; end if;
 if c.state='cancelled' then return; end if;
 if c.state='completed' then raise exception 'Completed work is immutable'; end if;
 if c.order_id is not null then
   if o.status not in('cancelled','expired') then raise exception 'Cancel payment before changing the work'; end if;
 end if;
 update book_completion_candidates set state='cancelled',cancelled_at=now() where id=c.id;
end; $$;

-- Only the case where no Stripe request could have left our server. Check under
-- the order lock so a racing request cannot be sent after local cancellation.
create function public.cancel_unstarted_book_completion(input_candidate_id uuid) returns void
language plpgsql security definer set search_path=public,auth as $$
declare c book_completion_candidates%rowtype; o commerce_orders%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
 select * into c from book_completion_candidates where id=input_candidate_id;
 select * into o from commerce_orders where id=c.order_id for update;
 if o.id is null or o.status not in('checkout_pending','cancelled','expired')
   or o.stripe_checkout_session_id is not null
   or o.metadata ? 'book_completion_checkout_request' then raise exception 'Verify payment with Stripe first'; end if;
 perform public.expire_commerce_order(o.id);
 perform public.cancel_book_completion(c.id);
end; $$;

-- Caller supplies server-copied assets, never customer-supplied paths. Replacing a
-- cancelled candidate's draft keeps the URL, but uses a different immutable copy prefix.
create function public.write_book_completion_publication(input_candidate_id uuid,input_publication_id uuid,
 input_metadata jsonb,input_items jsonb,input_videos jsonb) returns void
language plpgsql security definer set search_path=public,auth as $$
declare c book_completion_candidates%rowtype; p voice_publications%rowtype; expected_ids uuid[]; actual_ids uuid[];
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
 select * into c from book_completion_candidates where id=input_candidate_id for update;
 select * into p from voice_publications where id=input_publication_id for update;
 if c.id is null or c.state<>'prepared' or p.id is null or p.status<>'draft'
 or p.book_project_id<>c.book_project_id or p.work_manifest_id is distinct from c.work_manifest_id
 or input_metadata->>'completionCandidateId' is distinct from c.id::text
 then raise exception 'Invalid candidate publication'; end if;
 select array_agg(distinct (a->>'id')::uuid order by (a->>'id')::uuid) into expected_ids
 from jsonb_array_elements((c.snapshot->'answers')||coalesce(c.snapshot->'web_intro'->'answers','[]')) a;
 select array_agg((i->>'source_answer_id')::uuid order by (i->>'source_answer_id')::uuid) into actual_ids from jsonb_array_elements(input_items) i;
 if expected_ids is distinct from actual_ids then raise exception 'Candidate selection mismatch'; end if;
 delete from voice_publication_items where publication_id=p.id;
 insert into voice_publication_items(publication_id,item_order,source_answer_id,chapter_title,question_text,transcript_text,audio_assets,photo_assets,metadata)
 select p.id,i.item_order,i.source_answer_id,coalesce(i.chapter_title,''),coalesce(i.question_text,''),coalesce(i.transcript_text,''),coalesce(i.audio_assets,'[]'),coalesce(i.photo_assets,'[]'),coalesce(i.metadata,'{}')
 from jsonb_to_recordset(input_items) i(item_order integer,source_answer_id uuid,chapter_title text,question_text text,transcript_text text,audio_assets jsonb,photo_assets jsonb,metadata jsonb);
 update voice_publications set snapshot_metadata=input_metadata,video_assets=input_videos,snapshot_schema_version=3,
 book_title=coalesce(c.snapshot->'cover'->>'title',c.snapshot->'project'->>'title',''),
 book_subtitle=coalesce(c.snapshot->'cover'->>'subtitle',''),
 subject_name=coalesce(c.snapshot->'subject'->>'display_name',c.snapshot->'subject'->>'preferred_name','') where id=p.id;
 update book_completion_candidates set publication_id=p.id,media_ready_at=now() where id=c.id;
end; $$;

-- Preserve the intro already captured in a candidate; never pick up later live edits.
create or replace function public.capture_web_book_intro() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.confirmed_at is not null and (tg_op='INSERT' or old.confirmed_at is null) and not(new.snapshot ? 'web_intro') then
   new.snapshot:=new.snapshot||jsonb_build_object('web_intro',public.web_book_intro(new.book_project_id));
 end if;
 return new;
end; $$;

revoke all on function public.prepare_book_completion(uuid,integer,boolean,text,boolean) from public,anon;
grant execute on function public.prepare_book_completion(uuid,integer,boolean,text,boolean) to authenticated;
revoke all on function public.get_book_completion(uuid),public.guard_pending_book_completion() from public,anon;
grant execute on function public.get_book_completion(uuid) to authenticated;
revoke all on function public.seal_book_completion_media(uuid,uuid),public.bind_book_completion_order(uuid,uuid),public.complete_book_order(uuid),public.cancel_book_completion(uuid) from public,anon,authenticated;
grant execute on function public.seal_book_completion_media(uuid,uuid),public.bind_book_completion_order(uuid,uuid),public.complete_book_order(uuid),public.cancel_book_completion(uuid) to service_role;
revoke all on function public.write_book_completion_publication(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.write_book_completion_publication(uuid,uuid,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.create_book_completion_order(uuid,uuid,text,integer,integer,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.create_book_completion_order(uuid,uuid,text,integer,integer,boolean,jsonb) to service_role;
revoke all on function public.cancel_unstarted_book_completion(uuid) from public,anon,authenticated;
grant execute on function public.cancel_unstarted_book_completion(uuid) to service_role;
commit;
