begin;
-- Additive release; do not apply without the milestone UI/TEST release gate.
-- Q21/Q22/Q23 and existing answers, purchases, sharing, progress remain intact.
update questions set content='縦糸横糸を始めることになったきっかけや、これから人生を振り返っていく今の気持ちを聞かせてください。',
 meta_json=coalesce(meta_json,'{}')||'{"answer_formats":["audio","video"],"video_slot_key":"opening","include_in_story_list":true}'::jsonb where id='TY_ONB04';
update question_set_items set question_text_snapshot=(select content from questions where id='TY_ONB04'),
 prompt_hint_snapshot=E'話すヒント（すべてに答える必要はありません）\n・始めようと思ったきっかけ\n・誰かから贈られた方は、そのときのこと\n・これから語ってみたいこと\n・始める今、感じていること',
 meta_json=meta_json||'{"answer_formats":["audio","video"],"video_slot_key":"opening","include_in_story_list":true}'::jsonb where question_id='TY_ONB04';
-- Preserve answered prompt snapshots; only capabilities are added to those rows.
update user_questions set meta_json=meta_json||'{"answer_formats":["audio","video"],"video_slot_key":"opening","include_in_story_list":true}'::jsonb,
 question_text_snapshot=case when status='answered' or answered_at is not null then question_text_snapshot else (select content from questions where id='TY_ONB04') end
 where question_id='TY_ONB04';

insert into questions(id,sequence_order,chapter,content,is_active,meta_json) values('TY_CLOSING01',8999,'おわりの章',
 'ここまで人生を振り返ってみて、今どんなことを感じていますか？',true,
 '{"onboarding_group":"closing_reflection","flow_type":"story","answer_formats":["audio","video"],"video_slot_key":"closing","include_in_story_list":true,"include_in_book_body":true,"prompt_hint":"まとまっていなくても構いません。今浮かんでいることを、自由にお話しください。"}')
 on conflict(id) do nothing;
-- No bulk backfill into ongoing/completed projects. Attach on explicit entry.
-- Future question capabilities can add formats/slot keys without changing tables.
-- The existing self-flow guard used sequence<=4, which is not stable across
-- multiple projects. The opening milestone is still paid introduction, never
-- an implicit start of the nine themes / refund boundary.
do $$ declare definition text; needle text:='else q.sequence_order is null or q.sequence_order>4 end'; begin
 definition:=pg_get_functiondef('public.guard_experience_content_write()'::regprocedure);
 if position(needle in definition)=0 then raise exception 'Content guard definition drift';end if;
 execute replace(definition,needle,'else (q.sequence_order is null or q.sequence_order>4) and not (q.question_id=''TY_ONB04'' and q.meta_json->>''onboarding_group''=''starting_motivation'') end');
end $$;
create table public.book_milestone_uploads (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references book_projects(id),
 question_id uuid not null references user_questions(id), actor_id uuid not null references auth.users(id),
 answer_id uuid not null, mode text not null check(mode in('initial','replace','append')),
 format text not null check(format in('audio','video')), revision text not null,
 audio_path text not null unique, family_upload_id uuid references family_uploads(id),
 video_id uuid, video_path text unique, created_at timestamptz not null default now(), committed_at timestamptz
);
alter table book_milestone_uploads enable row level security;
revoke all on book_milestone_uploads from public,anon,authenticated;
create table public.book_milestone_revisions (
 upload_id uuid primary key references book_milestone_uploads(id), project_id uuid not null,
 actor_id uuid not null, answer_snapshot jsonb, media_snapshot jsonb, video_snapshot jsonb,
 created_at timestamptz not null default now()
);
alter table book_milestone_revisions enable row level security;
revoke all on book_milestone_revisions from public,anon,authenticated;

create function public.book_milestone_allowed(p uuid) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from book_projects b where b.id=p and b.status='active'
 and experience_data_allowed(p,true) and (case when family_managed(p) then family_creator(p)
 else b.owner_user_id=auth.uid() end)
 and (b.access_status in('paid','gifted','legacy') or exists(select 1 from experience_contracts c where c.book_project_id=p and c.payment_confirmed_at is not null and c.refund_confirmed_at is null)))
$$;
create function public.book_ensure_closing(p uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare b book_projects%rowtype; q uuid; seq integer;
begin
 if not book_milestone_allowed(p) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into b from book_projects where id=p for update;
 select id into q from user_questions where book_project_id=p and question_id='TY_CLOSING01';
 if q is not null then return q;end if;
 -- A fixed/ordered work is not silently reopened or rewritten.
 if exists(select 1 from book_work_manifests where book_project_id=p and confirmed_at is not null) then return null;end if;
 if not exists(select 1 from user_questions where book_project_id=p and is_active and meta_json->>'theme_code'='ty_theme_now_future')
 or exists(select 1 from user_questions where book_project_id=p and is_active and meta_json->>'theme_code' is not null
 and coalesce(meta_json->>'onboarding_group','')<>'trial_experience' and coalesce(status,'pending') not in('answered','skipped'))
 then raise exception 'Finish or skip the nine themes first';end if;
 -- Existing answers/profiles sometimes use user+sequence identity. Never renumber.
 perform 1 from profiles where id=b.owner_user_id for update;
 select greatest(8999,coalesce(max(sequence_order),0)+1) into seq from user_questions where user_id=b.owner_user_id;
 insert into user_questions(user_id,book_project_id,question_id,sequence_order,is_active,chapter_title_snapshot,question_text_snapshot,meta_json,status)
 select b.owner_user_id,p,id,seq,true,chapter,content,meta_json,'pending' from questions where id='TY_CLOSING01' returning id into q;
 return q;
end $$;
create function public.book_milestone_context(p uuid,q uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare u user_questions%rowtype; a answers%rowtype; rev text;
begin
 if not book_milestone_allowed(p) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into u from user_questions where id=q and book_project_id=p and is_active;
 if u.id is null or not coalesce(u.meta_json->'answer_formats','[]') @> '["video"]'::jsonb then raise exception 'Question format unavailable';end if;
 if exists(select 1 from experience_contracts where book_project_id=p) and not family_question_allowed(q) then raise exception 'Question unavailable';end if;
 select * into a from answers where book_project_id=p and user_question_id=q;
 rev:=md5(jsonb_build_object('answer',to_jsonb(a),'media',(select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]') from media_assets m where m.answer_id=a.id),
 'videos',(select coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]') from video_stories v where v.source_answer_id=a.id))::text);
 return jsonb_build_object('revision',rev,'answerId',a.id,'text',u.question_text_snapshot,
 'hint',case when u.question_id='TY_ONB04' then E'話すヒント（すべてに答える必要はありません）\n・始めようと思ったきっかけ\n・誰かから贈られた方は、そのときのこと\n・これから語ってみたいこと\n・始める今、感じていること' else u.meta_json->>'prompt_hint' end,
 'textBody',coalesce(a.transcript_edited,a.transcript_readable,a.transcript_raw,''),
 'hasVideo',exists(select 1 from video_stories where source_answer_id=a.id),
 'audioPartCount',(select count(*) from media_assets where answer_id=a.id and asset_type='audio' and meta_json->>'video_id' is null),
 'videoCount',(select count(*) from video_stories where book_project_id=p));
end $$;
create function public.book_milestone_skip(p uuid,q uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform book_milestone_context(p,q);
 update user_questions set status='skipped',skipped_at=now() where id=q and status is distinct from 'answered' and answered_at is null;
end $$;

create function public.book_milestone_reserve(p uuid,q uuid,mode text,format text,audio_ext text,video_ext text,expected text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c jsonb; r book_milestone_uploads%rowtype; f jsonb;
begin
 perform 1 from book_projects where id=p for update;
 c:=book_milestone_context(p,q);
 if expected is distinct from c->>'revision' then raise exception 'Story changed' using errcode='40001';end if;
 if mode is null or mode not in('initial','append','replace') or format is null or format not in('audio','video')
 or audio_ext is null or audio_ext not in('mp4','webm') or video_ext is null or video_ext not in('mp4','webm') then raise exception 'Invalid capture';end if;
 if (mode='initial') is distinct from (c->>'answerId' is null) then raise exception 'Answer state changed' using errcode='40001';end if;
 if format='video' and mode='append' and (c->>'hasVideo')::boolean then raise exception 'This milestone already has a video';end if;
 -- Match the existing App/FamilySubjectStories audio append limit. A video's
 -- extracted audio is not a separate audio answer and consumes no audio slot.
 if format='audio' and mode='append' and (c->>'audioPartCount')::integer>=5 then raise exception 'Audio append limit reached';end if;
 if format='video' and not (c->>'hasVideo')::boolean and (c->>'videoCount')::integer>=2 then raise exception 'Two existing videos are preserved';end if;
 r.id:=gen_random_uuid();r.answer_id:=coalesce((c->>'answerId')::uuid,gen_random_uuid());
 if family_managed(p) then f:=family_reserve_upload(p,'audio',audio_ext);r.family_upload_id:=(f->>'id')::uuid;r.audio_path:=f->>'path';
 else r.audio_path:=auth.uid()||'/'||p||'/'||r.answer_id||'/'||r.id||'.'||audio_ext;end if;
 if format='video' then r.video_id:=gen_random_uuid();r.video_path:=auth.uid()||'/'||p||'/'||r.video_id||'/capture.'||video_ext;end if;
 insert into book_milestone_uploads(id,project_id,question_id,actor_id,answer_id,mode,format,revision,audio_path,family_upload_id,video_id,video_path)
 values(r.id,p,q,auth.uid(),r.answer_id,mode,format,expected,r.audio_path,r.family_upload_id,r.video_id,r.video_path);
 return jsonb_build_object('id',r.id,'answer_id',r.answer_id,'audio_path',r.audio_path,'family_upload_id',r.family_upload_id,'video_path',r.video_path);
end $$;

create function public.book_milestone_commit(upload uuid,draft jsonb,duration integer,video_bytes bigint,video_mime text) returns uuid
language plpgsql security definer set search_path=public as $$
declare r book_milestone_uploads%rowtype; c jsonb; b book_projects%rowtype; q user_questions%rowtype; a answers%rowtype; slot integer; body text;
begin
 select * into r from book_milestone_uploads where id=upload;
 if r.id is null or r.actor_id is distinct from auth.uid() or not book_milestone_allowed(r.project_id) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into b from book_projects where id=r.project_id for update;
 select * into r from book_milestone_uploads where id=upload for update;
 if r.committed_at is not null then return r.answer_id;end if;
 if r.created_at<now()-interval '1 hour' then raise exception 'Recording expired; reopen';end if;
 c:=book_milestone_context(r.project_id,r.question_id);
 if r.revision is distinct from c->>'revision' then raise exception 'Story changed' using errcode='40001';end if;
 if r.format='audio' and r.mode='append' and (c->>'audioPartCount')::integer>=5 then raise exception 'Audio append limit reached';end if;
 if draft is null or jsonb_typeof(draft)<>'object' or octet_length(draft::text)>400000 or duration is null or duration<1 or duration>(case when r.format='video' then 300 else 600 end)
 or coalesce(draft->>'selectedStyle','readable') not in('clean','readable','essay') then raise exception 'Invalid recording';end if;
 if not exists(select 1 from storage.objects where bucket_id='audio' and name=r.audio_path and coalesce((metadata->>'size')::bigint,0)>0) then raise exception 'Audio upload missing';end if;
 if r.family_upload_id is not null then perform family_pending_voice_scope(r.project_id,auth.uid(),array[r.family_upload_id]);end if;
 if r.format='video' then
   if r.mode='append' and (c->>'hasVideo')::boolean then raise exception 'This milestone already has a video';end if;
   if video_bytes is null or video_bytes not between 1 and 50331648 or video_mime not like 'video/%'
   or not exists(select 1 from storage.objects where bucket_id='videos' and name=r.video_path and (metadata->>'size')::bigint=video_bytes) then raise exception 'Video upload missing';end if;
 end if;
 select * into q from user_questions where id=r.question_id for update;
 select * into a from answers where id=r.answer_id for update;
 insert into book_milestone_revisions(upload_id,project_id,actor_id,answer_snapshot,media_snapshot,video_snapshot)
 values(r.id,r.project_id,auth.uid(),to_jsonb(a),
 (select coalesce(jsonb_agg(to_jsonb(m)),'[]') from media_assets m where answer_id=a.id),
 (select coalesce(jsonb_agg(to_jsonb(v)),'[]') from video_stories v where source_answer_id=a.id));
 -- Retain old bytes and private audit. Never delete photos or fixed publications.
 if r.mode='replace' then
   delete from media_assets where answer_id=a.id and asset_type='audio';
   delete from video_stories where source_answer_id=a.id;
 end if;
 body:=coalesce(draft->>'editedText',draft->>'transcriptReadable',draft->>'transcript','');
 if a.id is null then
   insert into answers(id,user_id,book_project_id,speaker_person_id,subject_person_id,user_question_id,question_id,sequence_order,access_override)
   values(r.answer_id,q.user_id,b.id,b.subject_person_id,b.subject_person_id,q.id,q.question_id,q.sequence_order,'private_forever');
 end if;
 update answers set transcript_raw=coalesce(draft->>'transcript',''),transcript_clean=coalesce(draft->>'transcriptClean',body),transcript_readable=coalesce(draft->>'transcriptReadable',body),
 transcript_essay=coalesce(draft->>'transcriptEssay',''),transcript_edited=body,selected_style=coalesce(draft->>'selectedStyle','readable'),
 meta_json=coalesce(meta_json,'{}')||jsonb_build_object('last_actor_user_id',auth.uid(),'main_response_format',case when r.mode='append' then coalesce(a.meta_json->>'main_response_format','audio') else r.format end)
 where id=r.answer_id;
 insert into media_assets(answer_id,user_id,family_id,book_project_id,person_id,asset_type,storage_path,meta_json)
 values(r.answer_id,auth.uid(),b.family_id,b.id,b.subject_person_id,'audio',r.audio_path,jsonb_build_object('duration_seconds',duration,'actor_user_id',auth.uid(),'video_id',r.video_id));
 if r.format='video' then
   select s into slot from generate_series(1,2) s where not exists(select 1 from video_stories where book_project_id=b.id and slot_order=s) order by s limit 1;
   if slot is null then raise exception 'Two existing videos are preserved';end if;
   insert into video_stories(id,book_project_id,subject_person_id,created_by_user_id,slot_order,prompt_kind,prompt_text,title,source_answer_id,video_storage_path,duration_seconds,mime_type,file_size_bytes,status,transcript_text,metadata)
   values(r.video_id,b.id,b.subject_person_id,auth.uid(),slot,'existing_question',q.question_text_snapshot,coalesce(q.chapter_title_snapshot,'節目の語り'),r.answer_id,r.video_path,duration,video_mime,video_bytes,'ready',coalesce(draft->>'transcript',''),jsonb_build_object('upload_complete',true,'milestone_key',q.meta_json->>'video_slot_key'));
 end if;
 update user_questions set status='answered',answered_at=coalesce(answered_at,now()) where id=q.id;
 update family_uploads set answer_id=r.answer_id,committed_at=now() where id=r.family_upload_id;
 update book_milestone_uploads set committed_at=now() where id=r.id;
 return r.answer_id;
end $$;

-- Public defaults revoked explicitly; only narrowly scoped user RPCs are exposed.
revoke all on function book_milestone_allowed(uuid),book_ensure_closing(uuid),book_milestone_context(uuid,uuid),book_milestone_skip(uuid,uuid),book_milestone_reserve(uuid,uuid,text,text,text,text,text),book_milestone_commit(uuid,jsonb,integer,bigint,text) from public,anon;
grant execute on function book_milestone_allowed(uuid),book_ensure_closing(uuid),book_milestone_context(uuid,uuid),book_milestone_skip(uuid,uuid),book_milestone_reserve(uuid,uuid,text,text,text,text,text),book_milestone_commit(uuid,jsonb,integer,bigint,text) to authenticated;

-- Preserve the current journey authorization/navigation; enrich only its returned
-- question metadata. Exact replacement aborts on schema drift.
do $$ declare definition text; needle text:='''chapter'',q.chapter_title_snapshot'; begin
 definition:=pg_get_functiondef('public.family_journey(uuid)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'family_journey definition drift';end if;
 execute replace(definition,needle,needle||',''answer_formats'',coalesce(q.meta_json->''answer_formats'',''["audio"]''::jsonb),''video_slot_key'',q.meta_json->>''video_slot_key'',''prompt_hint'',q.meta_json->>''prompt_hint'',''include_in_story_list'',coalesce(q.meta_json->''include_in_story_list'',''true''::jsonb)');
end $$;

-- One CURRENT video per question; origin (initial/append/replace) is irrelevant.
-- Old, unassociated videos remain untouched. Existing project-wide two slots
-- remain the BOOK product limit, not a two-question storage schema.
create function public.guard_milestone_video() returns trigger language plpgsql security definer set search_path=public as $$
declare q user_questions%rowtype; begin
 if new.source_answer_id is null then return new;end if;
 select uq.* into q from answers a join user_questions uq on uq.id=a.user_question_id where a.id=new.source_answer_id and a.book_project_id=new.book_project_id;
 if coalesce(q.meta_json->'answer_formats','[]') @> '["video"]'::jsonb then
  perform 1 from book_projects where id=new.book_project_id for update;
  if new.duration_seconds is null or new.duration_seconds>300 then raise exception 'Milestone video maximum is five minutes';end if;
  if exists(select 1 from video_stories where source_answer_id=new.source_answer_id and id<>new.id) then raise exception 'This milestone already has a video';end if;
 end if;
 return new;
end $$;
revoke all on function guard_milestone_video() from public,anon,authenticated;
create trigger guard_milestone_video before insert or update on video_stories for each row execute function guard_milestone_video();

-- Pending AND retired uploads remain scoped after replacement. Without this
-- restrictive policy, an old actor-prefixed video could outlive supporter consent.
create function public.book_milestone_storage_allowed(bucket text,path text,writing boolean) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare r book_milestone_uploads%rowtype; begin
 select * into r from book_milestone_uploads where (bucket='videos' and video_path=path) or (bucket='audio' and audio_path=path);
 if not found then return true;end if;
 if writing then return r.actor_id=auth.uid() and r.committed_at is null and r.created_at>now()-interval '1 hour' and book_milestone_allowed(r.project_id);end if;
 -- Only current committed audio defers to the pre-existing read policies.
 -- Production catalog verified: family_answer_visible(uuid,uuid); passing
 -- auth.uid() explicitly preserves its existing creator/shared-recipient rules.
 if bucket='audio' and r.committed_at is not null and exists(select 1 from media_assets m where m.answer_id=r.answer_id and m.asset_type='audio' and m.storage_path=path) then
  return experience_data_allowed(r.project_id,false) and (not family_managed(r.project_id) or family_answer_visible(r.answer_id,auth.uid()));
 end if;
 if family_managed(r.project_id) then return family_creator(r.project_id) and experience_data_allowed(r.project_id,false);end if;
 return exists(select 1 from book_projects where id=r.project_id and owner_user_id=auth.uid()) and experience_data_allowed(r.project_id,false);
end $$;
revoke all on function book_milestone_storage_allowed(text,text,boolean) from public,anon;
grant execute on function book_milestone_storage_allowed(text,text,boolean) to authenticated;
create policy milestone_storage_read on storage.objects as restrictive for select to authenticated using(book_milestone_storage_allowed(bucket_id,name,false));
create policy milestone_storage_insert on storage.objects as restrictive for insert to authenticated with check(book_milestone_storage_allowed(bucket_id,name,true));
create policy milestone_storage_update on storage.objects as restrictive for update to authenticated using(book_milestone_storage_allowed(bucket_id,name,true)) with check(book_milestone_storage_allowed(bucket_id,name,true));
create policy milestone_storage_delete on storage.objects as restrictive for delete to authenticated using(book_milestone_storage_allowed(bucket_id,name,true));

-- The existing restrictive upload policy requires a reserved video_stories row.
-- Milestones deliberately create the current video only on atomic commit, so
-- accept their exact, unexpired reservation as well (never just a path prefix).
do $$ declare definition text; needle text:='select exists(select 1 from public.video_stories v where'; begin
 definition:=pg_get_functiondef('public.video_delivery_path_allowed(text)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'Video reservation policy definition drift';end if;
 execute replace(definition,needle,'select exists(select 1 from public.book_milestone_uploads r where r.video_path=input_name and r.actor_id=auth.uid() and r.committed_at is null and r.created_at>now()-interval ''1 hour'' and public.book_milestone_allowed(r.project_id)) or exists(select 1 from public.video_stories v where');
end $$;
commit;
