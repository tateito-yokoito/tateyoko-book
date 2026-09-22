// Aggregates only; no customer names, answers, credentials or remote writes.
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(process.argv[2],'--read-only');
const cli=process.env.QA_SUPABASE_CLI;assert.ok(cli);
const ref='wquxjeqkumossjxehdop';
const sql=`begin read only;set local statement_timeout='15s';
select jsonb_build_object(
 'readOnly',current_setting('transaction_read_only'),
 'projects',(select count(*) from book_projects),
 'activeProjects',(select count(*) from book_projects where status='active'),
 'startingCompleted',(select count(*) from book_projects where onboarding_completed_at is not null or onboarding_ritual_step in('chapter_complete','theme_intro','completed')),
 'themeInProgress',(select count(distinct book_project_id) from user_questions where meta_json ? 'theme_code' and coalesce(status,'pending') not in('answered','skipped')),
 'themeCompleted',(select count(*) from book_projects b where exists(select 1 from user_questions q where q.book_project_id=b.id and q.meta_json->>'theme_code'='ty_theme_now_future') and not exists(select 1 from user_questions q where q.book_project_id=b.id and q.meta_json ? 'theme_code' and coalesce(q.meta_json->>'onboarding_group','')<>'trial_experience' and coalesce(status,'pending') not in('answered','skipped'))),
 'confirmedBooks',(select count(*) from book_work_manifests where confirmed_at is not null),
 'openingQuestions',(select count(*) from user_questions where question_id='TY_ONB04'),
 'openingAnswered',(select count(*) from user_questions where question_id='TY_ONB04' and (status='answered' or answered_at is not null)),
 'openingWithAnswerButPending',(select count(*) from user_questions q where question_id='TY_ONB04' and status is distinct from 'answered' and answered_at is null and exists(select 1 from answers a where a.user_question_id=q.id)),
 'videos',(select count(*) from video_stories),
 'unassociatedVideos',(select count(*) from video_stories where source_answer_id is null),
 'videoProjectsAtLimit',(select count(*) from (select book_project_id from video_stories group by book_project_id having count(*)>=2) x),
 'videosOverFiveMinutes',(select count(*) from video_stories where duration_seconds>300),
 'duplicateQuestionVideos',(select count(*) from (select source_answer_id from video_stories where source_answer_id is not null group by source_answer_id having count(*)>1) x),
 'closingAlreadyExists',exists(select 1 from questions where id='TY_CLOSING01'),
 'storageBuckets',(select jsonb_agg(jsonb_build_object('id',id,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)) from storage.buckets where id in('audio','videos'))
) as impact;commit;`;
const raw=execFileSync(cli,['db','query','--linked','--project-ref',ref,sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const result=JSON.parse(raw.slice(raw.indexOf('{')));assert.ok(!result.error);
const impact=result.rows[0].impact;assert.equal(impact.readOnly,'on');
mkdirSync('output/book-milestones-preflight',{recursive:true});
writeFileSync('output/book-milestones-preflight/impact.json',JSON.stringify({at:new Date().toISOString(),ref,...impact},null,2),{mode:0o600});
console.log(JSON.stringify(impact));
