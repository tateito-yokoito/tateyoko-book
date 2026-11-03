-- Keep the three childhood prompts as stable IDs. Existing assigned questions
-- and answers are never rewritten; new accounts receive the prompts normally.
with trial(id, seq, prompt, hint, ordinal) as (values
 ('TY_TRIAL_CHILDHOOD01',9011,'幼い頃、どんなところに住んでいましたか？','地名や地域の雰囲気、家のことなど、思い出せることから教えてください。',1),
 ('TY_TRIAL_CHILDHOOD02',9012,'その頃、よく一緒にいた人を一人思い浮かべてください。どんな人でしたか？','母、父、祖父母、きょうだい、友達、先生など。',2),
 ('TY_TRIAL_CHILDHOOD03',9013,'その頃、どんな遊びが好きでしたか？','一人で夢中になったことでも、誰かと遊んだことでも。どんなふうに遊んでいたか、聞かせてください。',3)
)
insert into public.questions(id,sequence_order,chapter,content,is_active,meta_json)
select id,seq,'幼い頃',prompt,true,jsonb_build_object(
 'product_brand','tateito_yokoito','flow_type','trial','flow_phase','trial',
 'question_role','trial_experience','onboarding_group','trial_experience',
 'onboarding_order',ordinal,'progress_label',ordinal || ' / 3',
 'trial_version','childhood_v1','theme_code','ty_theme_childhood','theme_label','幼い頃',
 'prompt_hint',hint,'include_in_profile_text',false,'include_in_profile_audio',false,
 'include_in_story_list',true,'include_in_book_body',true)
from trial on conflict(id) do nothing;

-- This is a pre-purchase claim. The verified Auth user and guest capability
-- are supplied by the Edge handler. All DB writes happen in one transaction.
create or replace function public.claim_guest_trial_before_purchase(
 input_token_hash text, input_user_id uuid, input_project_id uuid,
 input_audio_paths jsonb
)
returns jsonb language plpgsql security definer
set search_path = public, auth, storage, pg_temp as $$
declare trial public.guest_trial_sessions%rowtype;
declare project public.book_projects%rowtype;
declare item public.guest_trial_answers%rowtype;
declare target public.user_questions%rowtype;
declare guest_question public.user_questions%rowtype;
declare answer_id uuid;
declare audio_path text;
declare target_id text;
declare n integer := 0;
declare next_seq integer;
declare copied integer := 0;
begin
 if input_token_hash !~ '^[a-f0-9]{64}$' or input_user_id is null
   or input_project_id is null or jsonb_typeof(input_audio_paths) is distinct from 'object'
 then raise exception 'Invalid claim' using errcode='22023'; end if;
 select * into trial from public.guest_trial_sessions
   where token_hash=input_token_hash for update;
 if trial.id is null or trial.origin_kind <> 'self'
 then raise exception 'Trial not found' using errcode='42501'; end if;
 if trial.status='claimed' then
   if trial.claimed_user_id is distinct from input_user_id
     or trial.claimed_project_id is distinct from input_project_id
   then raise exception 'Trial belongs to another account' using errcode='42501'; end if;
   return jsonb_build_object('status','claimed','project_id',input_project_id,'count',3);
 end if;
 if trial.status <> 'completed' or trial.expires_at <= now()
 then raise exception 'Trial is not complete or has expired' using errcode='55000'; end if;
 select * into project from public.book_projects where id=input_project_id for update;
 if project.id is null or project.owner_user_id is distinct from input_user_id
   or project.status <> 'active' or project.project_type <> 'koebook'
   or project.subject_person_id is null
   or not exists(select 1 from public.user_person_links l where l.user_id=input_user_id
     and l.person_id=project.subject_person_id and l.role='self')
 then raise exception 'Not an owned story' using errcode='42501'; end if;
 if (select count(*) from public.guest_trial_answers a where a.session_id=trial.id
   and a.transcription_state='complete' and length(btrim(a.transcript))>0
   and a.question_id in ('TY_TRIAL_CHILDHOOD01','TY_TRIAL_CHILDHOOD02','TY_TRIAL_CHILDHOOD03')) <> 3
 then raise exception 'Three completed answers required' using errcode='22023'; end if;

 select greatest(
   coalesce((select max(q.sequence_order) from public.user_questions q
     where q.book_project_id=project.id),0),
   coalesce((select max(a.sequence_order) from public.answers a
     where a.user_id=input_user_id),0)
 )+1 into next_seq;
 for item in select * from public.guest_trial_answers where session_id=trial.id
   order by question_id loop
   n := n+1;
   select * into guest_question from public.user_questions q
     where q.book_project_id=project.id and q.user_id=input_user_id
       and q.question_id=item.question_id;
   if guest_question.id is null then
     insert into public.user_questions(user_id,book_project_id,question_id,sequence_order,
       chapter,chapter_title_snapshot,question_text_snapshot,status,is_active,meta_json)
     select input_user_id,project.id,q.id,next_seq,'幼い頃','幼い頃',q.content,
       'pending',true,q.meta_json
     from public.questions q where q.id=item.question_id
     returning * into guest_question;
     if guest_question.id is null then raise exception 'Question missing'; end if;
     next_seq := next_seq+1;
   end if;
   -- Unmapped childhood stories stay usable in the finished book as well as
   -- in the story viewer. This changes only this claimed story's trial prompts.
   update public.user_questions set meta_json=coalesce(meta_json,'{}'::jsonb)
     || '{"include_in_book_body":true}'::jsonb where id=guest_question.id;

   -- The first guest prompt explicitly corresponds to TY_Q01. If that slot
   -- already has an answer, retain the guest prompt as its own childhood story.
   target_id := item.question_id;
   if item.question_id='TY_TRIAL_CHILDHOOD01' then
     select * into target from public.user_questions q
       where q.book_project_id=project.id and q.user_id=input_user_id
         and q.question_id='TY_Q01';
     if target.id is not null and not exists(select 1 from public.answers a
       where a.user_id=input_user_id and a.sequence_order=target.sequence_order)
     then target_id:='TY_Q01'; end if;
   end if;
   if target_id=item.question_id then target:=guest_question; end if;
   if target_id <> item.question_id then
     -- The original trial slot has been represented by the formal question.
     -- Do not leave a second unanswered copy in the same story.
     update public.user_questions set status='skipped' where id=guest_question.id;
   end if;
   if exists(select 1 from public.answers a where a.user_id=input_user_id
     and a.sequence_order=target.sequence_order)
   then raise exception 'An answer already occupies the target question' using errcode='23505'; end if;

   audio_path:=nullif(input_audio_paths->>item.question_id,'');
   if item.audio_path is not null then
     if audio_path is null or audio_path !~ ('^' || input_user_id::text || '/' ||
       project.id::text || '/guest-trial/' || item.question_id || '\.(m4a|aac|webm|ogg|mp3)$')
       or not exists(select 1 from storage.objects o where o.bucket_id='audio' and o.name=audio_path)
     then raise exception 'Copied audio is missing' using errcode='22023'; end if;
   elsif audio_path is not null then
     raise exception 'Unexpected audio' using errcode='22023';
   end if;

   insert into public.answers(user_id,book_project_id,speaker_person_id,subject_person_id,
     user_question_id,question_id,sequence_order,transcript_raw,transcript_clean,
     transcript_readable,transcript_edited,selected_style,meta_json,created_at)
   values(input_user_id,project.id,project.subject_person_id,project.subject_person_id,
     target.id,target.question_id,target.sequence_order,item.transcript,item.transcript,
     item.transcript,item.transcript,'readable',jsonb_build_object(
       'story_origin','question','user_question_id',target.id,
       'guest_trial_question_id',item.question_id,'guest_trial_version','childhood_v1'),item.saved_at)
   returning id into answer_id;
   if audio_path is not null then
     insert into public.media_assets(answer_id,user_id,family_id,book_project_id,
       person_id,asset_type,storage_path,meta_json)
     values(answer_id,input_user_id,project.family_id,project.id,
       project.subject_person_id,'audio',audio_path,'{}'::jsonb);
     copied:=copied+1;
   end if;
   update public.user_questions set status='answered',answered_at=item.saved_at
     where id=target.id;
 end loop;
 if n<>3 then raise exception 'Three answers required'; end if;
 update public.guest_trial_sessions set status='claimed',claimed_user_id=input_user_id,
   claimed_project_id=project.id,last_used_at=now() where id=trial.id;
 return jsonb_build_object('status','claimed','project_id',project.id,
   'count',n,'audio_count',copied);
end;
$$;

revoke all on function public.claim_guest_trial_before_purchase(text,uuid,uuid,jsonb)
 from public,anon,authenticated;
grant execute on function public.claim_guest_trial_before_purchase(text,uuid,uuid,jsonb)
 to service_role;
