import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {db,as,admin,val,id} from './family-connection.sql.test.mjs';
try {
 await admin('');
 for(const file of ['202609210003_production_supporter.sql','202609210004_production_start_audit_key.sql','202609210005_separate_production_mode_and_authority.sql','202609220001_family_pilot_release_gates.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec(`insert into questions(id,sequence_order,chapter,content,meta_json) values('TY_ONB04',8004,'はじまりの章','OLD', '{"onboarding_group":"starting_motivation"}') on conflict do nothing;
 update book_projects set access_status='paid' where id='${id(21)}';
 update commerce_orders set status='paid' where id='${id(91)}';
 select confirm_experience_payment('${id(91)}',now());
 insert into user_questions(id,user_id,book_project_id,question_id,sequence_order,question_text_snapshot,meta_json) values('${id(8004)}','${id(1)}','${id(21)}','TY_ONB04',8004,'OLD','{"onboarding_group":"starting_motivation"}');`);
 const protectedState=()=>val(`select jsonb_build_object(
  'projects',(select jsonb_agg(to_jsonb(b) order by id) from book_projects b),
  'answers',(select jsonb_agg(to_jsonb(a) order by id) from answers a),
  'videos',(select jsonb_agg(to_jsonb(v) order by id) from video_stories v),
  'questionProgress',(select jsonb_agg(jsonb_build_object('id',id,'project',book_project_id,'sequence',sequence_order,'status',status,'answered_at',answered_at,'skipped_at',skipped_at) order by id) from user_questions)
 ) value`);
 const beforeMigration=await protectedState();
 await db.exec(await readFile(new URL('../../supabase/migrations/202609220002_book_milestones.sql',import.meta.url),'utf8'));
 assert.deepEqual(await protectedState(),beforeMigration,'Migration preserves existing projects, answers, videos, question order and progress');
 await as(1);
 await db.query('select start_paid_starting_chapter($1,true)',[id(21)]);
 const p=id(21),q=id(8004);
 const context=()=>val('select book_milestone_context($1,$2) value',[p,q]);
 assert.ok((await context()).text.includes('始めることになった'));
 const capture=async(mode,format,question=q,project=p)=>{
  const c=await val('select book_milestone_context($1,$2) value',[project,question]);
  const r=await val('select book_milestone_reserve($1,$2,$3,$4,$5,$6,$7) value',[project,question,mode,format,'webm','webm',c.revision]);
  if(r.video_path){
   assert.equal(await val('select video_delivery_path_allowed($1) value',[r.video_path]),true,'Reserved upload must pass existing Storage guard');
   await as(3);
   assert.equal(await val('select video_delivery_path_allowed($1) value',[r.video_path]),false,'Other actor cannot use reservation');
   await as(1);
  }
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('audio',$1,'{\"size\":100}')",[r.audio_path]);
  if(r.video_path)await db.query("insert into storage.objects(bucket_id,name,metadata) values('videos',$1,'{\"size\":1000}')",[r.video_path]);
  await as(1);return r;
 };
 const commit=(r,duration=300)=>val('select book_milestone_commit($1,$2,$3,$4,$5) value',[r.id,{transcript:'TEST',editedText:'TEST',selectedStyle:'readable'},duration,r.video_path?1000:0,r.video_path?'video/webm':'']);
 const first=await capture('initial','audio');const a=await commit(first);
 assert.equal(await commit(first),a,'Lost response retry is idempotent');
 assert.equal((await context()).hasVideo,false);
 // All questions retain five audio parts. Milestone video is a separate slot.
 for(let n=0;n<4;n++)await commit(await capture('append','audio'));
 assert.equal((await context()).audioPartCount,5);
 await assert.rejects(()=>capture('append','audio'),/Audio append limit reached/);
 const appended=await capture('append','video');await commit(appended);
 assert.equal((await context()).hasVideo,true);
 assert.equal((await context()).audioPartCount,5,'Extracted video audio consumes no audio slot');
 await assert.rejects(()=>capture('append','video'),/already has a video/);
 await assert.rejects(()=>capture('append','audio'),/Audio append limit reached/);
 assert.equal(await val('select count(*)::int value from video_stories where source_answer_id=$1',[a]),1);
 const previous=await val('select video_storage_path value from video_stories where source_answer_id=$1',[a]);
 await admin('');await db.query("insert into media_assets(answer_id,user_id,book_project_id,person_id,asset_type,storage_path) values($1,$2,$3,$4,'photo','test/photo.jpg')",[a,id(1),p,id(11)]);await as(1);
 const replacement=await capture('replace','video');
 await assert.rejects(()=>commit(replacement,301),/Invalid recording/);
 assert.equal(await val('select video_storage_path value from video_stories where source_answer_id=$1',[a]),previous,'Failed replacement preserves prior video');
 await commit(replacement);
 assert.equal(await val('select video_delivery_path_allowed($1) value',[replacement.video_path]),false,'Committed video cannot be overwritten through reservation');
 assert.equal((await context()).audioPartCount,0,'Video replacement consumes only the video slot');
 for(let n=0;n<5;n++)await commit(await capture('append','audio'));
 assert.equal((await context()).audioPartCount,5,'Five audio parts may coexist with one video');
 await assert.rejects(()=>capture('append','audio'),/Audio append limit reached/);
 assert.equal(await val("select count(*)::int value from media_assets where answer_id=$1 and asset_type='photo'",[a]),1,'Photos survive replacement');
 assert.equal(await val('select access_override value from answers where id=$1',[a]),'private_forever','No family sharing change');
 assert.equal(await val('select count(*)::int value from video_stories where source_answer_id=$1',[a]),1);
 assert.notEqual(await val('select video_storage_path value from video_stories where source_answer_id=$1',[a]),previous);
 await admin('');
 assert.equal(await val("select count(*)::int value from storage.objects where name=$1",[previous]),1,'Replaced bytes retained, not destructively deleted');
 assert.ok(await val('select count(*)::int value from book_milestone_revisions where project_id=$1',[p]));
 await as(3);await assert.rejects(()=>val('select book_milestone_context($1,$2) value',[p,q]),/Forbidden/);
 await as(1);await assert.rejects(()=>val('select book_ensure_closing($1) value',[p]),/nine themes/);
 await admin('');await db.query("update book_projects set onboarding_ritual_step='chapter_complete',onboarding_status='life_outline_completed' where id=$1",[p]);await as(1);
 await db.query('select start_main_experience($1,true)',[p]);
 await admin('');
 // Synthetic nine-theme completion. Existing third question is NOT changed.
 for(let n=1;n<=9;n++){
  await db.query("insert into questions(id,sequence_order,chapter,content) values($1,$2,$3,$4)",["MILESTONE_TEST_THEME_"+n,8100+n,'Theme '+n,'Unchanged theme question '+n]);
  await db.query("insert into user_questions(user_id,book_project_id,question_id,sequence_order,status,meta_json,question_text_snapshot) values($1,$2,$3,$4,'skipped',$5,$6)",[id(1),p,'MILESTONE_TEST_THEME_'+n,8100+n,{theme_code:n===9?'ty_theme_now_future':'theme_'+n},'Unchanged theme question '+n]);
 }
 const themeBefore=await val('select jsonb_agg(to_jsonb(q) order by id) value from user_questions q where book_project_id=$1 and meta_json ? $2',[p,'theme_code']);
 await as(1);const closing=await val('select book_ensure_closing($1) value',[p]);
 assert.equal(await val('select book_ensure_closing($1) value',[p]),closing,'Closing creation is idempotent');
 await db.query('select book_milestone_skip($1,$2)',[p,closing]);
 assert.equal(await val('select status value from user_questions where id=$1',[closing]),'skipped');
 await commit(await capture('initial','video',closing));
 assert.equal(await val('select count(*)::int value from video_stories where book_project_id=$1',[p]),2,'Opening + closing each have one video');
 await assert.rejects(()=>capture('append','video',closing),/already has a video/);
 await commit(await capture('append','audio',closing),600);
 await db.query('select book_milestone_skip($1,$2)',[p,closing]);
 assert.equal(await val('select status value from user_questions where id=$1',[closing]),'answered','Skip cannot overwrite existing answer');
 await admin('');
 assert.deepEqual(await val('select jsonb_agg(to_jsonb(q) order by id) value from user_questions q where book_project_id=$1 and meta_json ? $2',[p,'theme_code']),themeBefore);
 await db.query("insert into user_questions(id,user_id,book_project_id,question_id,sequence_order,question_text_snapshot,meta_json) select $1,$2,$3,id,8200,content,meta_json from questions where id='TY_ONB04'",[id(8200),id(1),id(20)]);
 await as(1);await db.query('select family_confirm_production_support($1,$2,true)',[id(20),id(1)]);
 const familyVideo=await capture('initial','video',id(8200),id(20));await commit(familyVideo);
 await admin('update family_private.rollout set enabled=false');await as(1);
 await assert.rejects(()=>capture('replace','video',id(8200),id(20)),/Forbidden/,'Closed release gate blocks new milestone RPC');
 await admin('update family_private.rollout set enabled=true');await as(1);
 const familyWorkspace=await val('select family_journey($1) value',[id(20)]);
 assert.deepEqual(familyWorkspace.questions.find(q=>q.id===id(8200)).answer_formats,['audio','video']);
 await as(2);await db.query('select family_revoke_production_support($1,$2)',[id(20),id(1)]);
 await as(1);await assert.rejects(()=>capture('replace','video',id(8200),id(20)),/Forbidden/);
 assert.equal(await val("select book_milestone_storage_allowed('videos',$1,false) value",[familyVideo.video_path]),false,'Revoked supporter cannot read actor-prefixed video');
 console.log('PASS milestone migration, audio/video slots, append/replace, duration, authorization, retry and retained history');
}catch(e){console.error(e.message,e.where || '',e.detail || '');process.exitCode=1;}finally{await db.close();}
