begin;

-- The global switch remains the emergency brake. An empty allowlist is closed.
alter table public.book_completion_rollout
  add column allowed_account_ids uuid[] not null default '{}'::uuid[];

create function public.book_completion_account_allowed(input_account_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select input_account_id is not null and exists (
    select 1 from public.book_completion_rollout
    where singleton and enabled and input_account_id=any(allowed_account_ids)
  )
$$;
revoke all on function public.book_completion_account_allowed(uuid) from public,anon,authenticated;
grant execute on function public.book_completion_account_allowed(uuid) to service_role;

-- The client sees only its own capability for an accessible project; it cannot
-- enumerate the allowlist or ask whether a different Account is enrolled.
create function public.can_use_book_completion(input_project_id uuid) returns boolean
language sql stable security definer set search_path=public,auth as $$
  select auth.uid() is not null
    and public.can_manage_book_cover(input_project_id) is true
    and public.book_completion_account_allowed(auth.uid()) is true
$$;
revoke all on function public.can_use_book_completion(uuid) from public,anon;
grant execute on function public.can_use_book_completion(uuid) to authenticated;

create or replace function public.prepare_book_completion(input_project_id uuid,input_expected_revision integer,
 input_qr_in_book boolean,input_pin text,input_subject_confirmed boolean) returns jsonb
language plpgsql security definer set search_path=public,auth,extensions as $$
declare w book_work_manifests%rowtype; c book_completion_candidates%rowtype; payload jsonb; pin text:=coalesce(input_pin,'');
begin
 if auth.uid() is null or public.can_manage_book_cover(input_project_id) is distinct from true
 or input_subject_confirmed is distinct from true then raise exception 'Subject confirmation required'; end if;
 perform public.assert_experience_processing(input_project_id,auth.uid());
 if public.book_completion_account_allowed(auth.uid()) is distinct from true then raise exception 'Completion is not enabled for this Account'; end if;
 if input_qr_in_book is null or (pin<>'' and pin !~ '^[0-9]{4}$') then raise exception 'Invalid QR or PIN setting'; end if;
 perform 1 from book_projects where id=input_project_id for update;
 select * into w from book_work_manifests where book_project_id=input_project_id for update;
 if w.id is null then raise exception 'Save selection first'; end if;
 if w.confirmed_at is not null then raise exception 'Existing confirmed work must be preserved'; end if;
 select * into c from book_completion_candidates where book_project_id=input_project_id and state in('prepared','checkout','completed') for update;
 if c.id is not null then
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

-- Service role is still required. Check the Account again when opening a new
-- payment; removing someone from the allowlist stops new Checkouts.
create or replace function public.create_book_completion_order(input_candidate_id uuid,input_purchaser_user_id uuid,
 input_discount_code text,input_standard_extra_copy_count integer,input_premium_copy_count integer,
 input_include_gift_package boolean,input_shipping_address jsonb) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare c book_completion_candidates%rowtype; result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Forbidden'; end if;
 select * into c from book_completion_candidates where id=input_candidate_id;
 if c.id is null then raise exception 'Order candidate unavailable'; end if;
 perform 1 from book_projects where id=c.book_project_id for update;
 select * into c from book_completion_candidates where id=input_candidate_id for update;
 if c.id is null or c.requested_by<>input_purchaser_user_id or c.state<>'prepared' or c.media_ready_at is null or c.order_id is not null
   or public.book_completion_account_allowed(input_purchaser_user_id) is distinct from true then
   raise exception 'Order already started or candidate unavailable';
 end if;
 result:=public.create_book_commerce_order(input_purchaser_user_id,c.book_project_id,input_discount_code,
   input_standard_extra_copy_count,input_premium_copy_count,input_include_gift_package,input_shipping_address);
 update book_completion_candidates set order_id=(result->'order'->>'id')::uuid,state='checkout' where id=c.id;
 return result;
end; $$;

-- Do not gate payment settlement here: a paid, previously authorized Checkout
-- must still complete if the allowlist or global switch is closed afterward.
commit;
