begin;

-- New IDs preserve the meaning of all existing question/answer snapshots.
-- Only newly allocated question sets change. No user_questions/answers are updated.
with trial(id, sequence_order, content, hint, ordinal) as (values
 ('TY_TRIAL_CHILDHOOD01',9011,'幼い頃、どんなところに住んでいましたか？','地名や地域の雰囲気、家のことなど、思い出せることから教えてください。',1),
 ('TY_TRIAL_CHILDHOOD02',9012,'その頃、よく一緒にいた人を一人思い浮かべてください。どんな人でしたか？','母、父、祖父母、きょうだい、友達、先生など。',2),
 ('TY_TRIAL_CHILDHOOD03',9013,'その頃、どんな遊びが好きでしたか？','一人で夢中になったことでも、誰かと遊んだことでも。どんなふうに遊んでいたか、聞かせてください。',3)
)
insert into public.questions(id, sequence_order, chapter, content, is_active, meta_json, chapter_id)
select id, sequence_order, '体験の一頁', content, true,
 jsonb_build_object(
  'product_brand','tateito_yokoito','flow_type','trial','flow_phase','trial',
  'question_role','trial_experience','onboarding_group','trial_experience',
  'onboarding_order',ordinal,'progress_label',ordinal || ' / 3',
  'trial_version','childhood_v1','theme_code','ty_theme_childhood','theme_label','幼い頃',
  'prompt_hint',hint,'include_in_profile_text',false,'include_in_profile_audio',false,
  'include_in_story_list',true,'include_in_book_body',false
 ),null
from trial
on conflict(id) do update set content=excluded.content,meta_json=excluded.meta_json;

update public.question_set_items item set is_active=false
from public.question_sets sets
where item.question_set_id=sets.id and sets.code='tateito_yokoito_standard_v2'
 and item.question_id in ('TY_TRIAL01','TY_TRIAL02','TY_TRIAL03');

insert into public.question_set_items(
 question_set_id,question_id,sequence_order,chapter_id,chapter_title_snapshot,
 chapter_subtitle_snapshot,question_text_snapshot,is_required,is_active,meta_json,
 prompt_style,prompt_hint_snapshot,reassurance_text_snapshot,followup_hint_snapshot,
 min_duration_seconds,min_transcript_chars
)
select sets.id,q.id,q.sequence_order,null,'体験の一頁',q.meta_json->>'progress_label',q.content,
 true,true,q.meta_json,'gentle',q.meta_json->>'prompt_hint',null,null,5,5
from public.question_sets sets cross join public.questions q
where sets.code='tateito_yokoito_standard_v2'
 and q.id in ('TY_TRIAL_CHILDHOOD01','TY_TRIAL_CHILDHOOD02','TY_TRIAL_CHILDHOOD03')
on conflict(question_set_id,question_id) do update set
 question_text_snapshot=excluded.question_text_snapshot,meta_json=excluded.meta_json,
 prompt_hint_snapshot=excluded.prompt_hint_snapshot,is_active=true;

update public.question_sets set meta_json=coalesce(meta_json,'{}'::jsonb)
 || jsonb_build_object('trial_version','childhood_v1')
where code='tateito_yokoito_standard_v2';

do $$ begin
 if not exists(select 1 from public.question_sets where code='tateito_yokoito_standard_v2') then
  raise exception 'The standard question set is missing';
 end if;
 if exists(select 1 from public.question_sets sets where sets.code='tateito_yokoito_standard_v2'
  and (select count(*) from public.question_set_items i where i.question_set_id=sets.id
   and i.is_active and i.meta_json->>'onboarding_group'='trial_experience')<>3) then
  raise exception 'Exactly three active trial items required';
 end if;
end $$;

commit;
