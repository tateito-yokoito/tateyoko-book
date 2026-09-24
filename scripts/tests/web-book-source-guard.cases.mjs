// TEST-only, transaction-rolled-back ownership matrix. No customer data edits.
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const ref='zpswxefgfabzvxdbtyvq';
const cli=process.env.QA_SUPABASE_CLI;
assert.ok(cli);
const id=n=>`a9240000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const p=id(1),person=id(2),question=id(3),answer=id(4),otherPerson=id(5);
const main=id(10),addition=id(11),photo=id(12),wrongPerson=id(13),video=id(20);
const owner='f6a3009c-d0ee-4872-8823-a931545b2a5a';
const sequence=Math.floor(Date.now()/1000)+10000;
const otherProject='c3f1b8ec-3a16-49ca-b816-9660b835c493';
const a=`${owner}/${p}/${answer}`;
const v=`${owner}/${p}/${video}`;
const paths={main:`${a}/part-01.wav`,addition:`${a}/part-02.wav`,photo:`${a}/photo-01.jpg`,
  wrongPerson:`${a}/photo-02.jpg`,video:`${v}/video.mp4`,videoAudio:`${v}/audio.aac`,poster:`${v}/poster.jpg`,
  cover:`book-covers/${p}/cover.jpg`,premium:`book-covers/${p}/premium-cover.jpg`};
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const source=(kind,sourceId,path,bucket)=>
  `public.publication_source_asset_allowed('${p}','${bucket}',${lit(path)},'${kind}','${sourceId}')`;
const cases=[
  ['normal_audio',source('audio',main,paths.main,'audio'),true],
  ['addition_audio',source('audio',addition,paths.addition,'audio'),true],
  ['normal_photo',source('photo',photo,paths.photo,'photos'),true],
  ['video',source('video',video,paths.video,'videos'),true],
  ['video_audio',source('video_audio',video,paths.videoAudio,'videos'),true],
  ['video_poster',source('video_poster',video,paths.poster,'videos'),true],
  ['cover',source('cover',p,paths.cover,'photos'),true],
  ['premium_cover',source('premium_cover',p,paths.premium,'photos'),true],
  ['wrong_project',`public.publication_source_asset_allowed('${otherProject}','audio',${lit(paths.main)},'audio','${main}')`,false],
  ['wrong_person',source('photo',wrongPerson,paths.wrongPerson,'photos'),false],
  ['wrong_family_account',`public.publication_source_asset_allowed('${otherProject}','photos',${lit(paths.cover)},'cover','${otherProject}')`,false],
  ['missing_path',source('audio',main,`${a}/missing.wav`,'audio'),false],
  ['tampered_path',source('audio',main,paths.addition,'audio'),false],
  ['wrong_bucket',source('audio',main,paths.main,'photos'),false],
  ['published_source',source('audio',main,`published/${p}/foreign.wav`,'audio'),false]
];
const sql=`begin;set local lock_timeout='3s';set local statement_timeout='90s';
insert into public.persons(id,family_id,display_name)
 select '${person}',family_id,'Guard QA Person' from public.book_projects where id='38915ab4-98a1-4055-9a23-7a812a8ff963';
insert into public.persons(id,family_id,display_name)
 select '${otherPerson}',family_id,'Guard QA Other Person' from public.book_projects where id='38915ab4-98a1-4055-9a23-7a812a8ff963';
insert into public.book_projects(id,family_id,owner_user_id,subject_person_id,title,status)
 select '${p}',family_id,'${owner}','${person}','Guard QA Project','active'
 from public.book_projects where id='38915ab4-98a1-4055-9a23-7a812a8ff963';
insert into public.user_questions(id,user_id,book_project_id,question_id,sequence_order,chapter,status,is_active)
 select '${question}','${owner}','${p}',question_id,${sequence},'QA','answered',true
 from public.user_questions where id='81b53b75-b341-44fc-a7a6-f27bcd0d96fd';
insert into public.answers(id,user_id,book_project_id,subject_person_id,speaker_person_id,user_question_id,question_id,sequence_order)
 select '${answer}','${owner}','${p}','${person}','${person}','${question}',question_id,${sequence}
 from public.user_questions where id='${question}';
insert into public.media_assets(id,answer_id,user_id,family_id,book_project_id,person_id,asset_type,storage_path)
 select x.id,'${answer}','${owner}',(select family_id from public.book_projects where id='${p}'),
 '${p}',x.person,x.kind,x.path from (values
 ('${main}'::uuid,'${person}'::uuid,'audio',${lit(paths.main)}),
 ('${addition}'::uuid,'${person}'::uuid,'audio',${lit(paths.addition)}),
 ('${photo}'::uuid,'${person}'::uuid,'photo',${lit(paths.photo)}),
 ('${wrongPerson}'::uuid,'${otherPerson}'::uuid,'photo',${lit(paths.wrongPerson)})
 ) x(id,person,kind,path);
insert into public.book_cover_settings(book_project_id,cover_photo_path,premium_cover_photo_path)
 values('${p}',${lit(paths.cover)},${lit(paths.premium)});
insert into storage.objects(bucket_id,name,metadata)
 select x.bucket,x.path,'{"size":1024}'::jsonb from (values
 ('audio',${lit(paths.main)}),('audio',${lit(paths.addition)}),
 ('photos',${lit(paths.photo)}),('photos',${lit(paths.wrongPerson)}),
 ('videos',${lit(paths.video)}),('videos',${lit(paths.videoAudio)}),('videos',${lit(paths.poster)}),
 ('photos',${lit(paths.cover)}),('photos',${lit(paths.premium)})
 ) x(bucket,path);
insert into public.video_stories(id,book_project_id,subject_person_id,created_by_user_id,slot_order,
 video_storage_path,audio_storage_path,poster_storage_path,status,duration_seconds,file_size_bytes,metadata)
 values('${video}','${p}','${person}','${owner}',1,${lit(paths.video)},${lit(paths.videoAudio)},
 ${lit(paths.poster)},'ready',5,1024,'{"upload_complete":true}'::jsonb);
select test,actual,expected from (values ${cases.map(([name,expression,expected])=>
  `(${lit(name)},${expression},${expected})`).join(',\n')}) tests(test,actual,expected);
rollback;`;
let raw;
try {raw=execFileSync(cli,['db','query','--linked','--project-ref',ref,sql],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:2_000_000,timeout:120_000});}
catch(error){
  const output=String(error.stdout||'');
  if(!output.includes('{'))throw new Error(`TEST query transport failed: ${String(error.stderr||error.message).slice(0,300)}`);
  const parsed=JSON.parse(output.slice(output.indexOf('{')));
  throw new Error(parsed.error?.message||'TEST query failed');
}
const result=JSON.parse(raw.slice(raw.indexOf('{')));
assert.ok(!result.error,result.error?.message);
assert.equal(result.rows?.length,cases.length);
for(const row of result.rows)assert.equal(row.actual,row.expected,`${row.test} mismatch`);
console.log(JSON.stringify({testOnly:true,rolledBack:true,passed:result.rows.map(row=>row.test),productionChanged:false}));
