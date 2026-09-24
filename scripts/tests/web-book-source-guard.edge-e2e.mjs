// Isolated TEST projects owned by the existing QA-only account. Never run on PROD.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const ref='zpswxefgfabzvxdbtyvq';
const account=JSON.parse(fs.readFileSync(process.env.QA_TEST_ACCOUNT_FILE,'utf8'));
assert.equal(account.ref,ref);
assert.equal(account.id,'f6a3009c-d0ee-4872-8823-a931545b2a5a');
const raw=execFileSync(process.env.QA_SUPABASE_CLI,['projects','api-keys','--project-ref',ref,'--output','json'],
 {encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const anon=keys.find(key=>key.name==='anon'&&key.type==='legacy')?.api_key;
const service=keys.find(key=>key.name==='service_role'&&key.type==='legacy')?.api_key;
assert.ok(anon&&service);
const url=`https://${ref}.supabase.co`;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const user=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=async promise=>{const {data,error}=await promise;assert.ifError(error);return data;};
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const db=sql=>{
 const output=execFileSync(process.env.QA_SUPABASE_CLI,['db','query','--linked','--project-ref',ref,sql],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:2_000_000,timeout:120_000});
 const result=JSON.parse(output.slice(output.indexOf('{')));
 assert.ok(!result.error,result.error?.message);
 return result.rows;
};
const auth=await ok(user.auth.signInWithPassword({email:account.email,password:account.password}));
assert.equal(auth.user.id,account.id);
const source=await ok(admin.from('book_projects').select('family_id').eq('id','38915ab4-98a1-4055-9a23-7a812a8ff963').single());
const existingQuestion=await ok(admin.from('user_questions').select('question_id').eq('id','81b53b75-b341-44fc-a7a6-f27bcd0d96fd').single());
const audioBytes=fs.readFileSync('public/site/hp-renewal/sample-voice.wav');
const photoBytes=fs.readFileSync('public/site/hero-book.jpg');
const results=[];
let sequence=Math.floor(Date.now()/1000);
try{
 for(const kind of ['one_invalid','all_valid','checkout_valid']){
  sequence+=1;
  const person=randomUUID(),project=randomUUID(),question=randomUUID(),answer=randomUUID();
  db(`begin;
   insert into public.persons(id,family_id,display_name) values(${literal(person)},${literal(source.family_id)},${literal(`Guard ${kind} QA`)});
   insert into public.book_projects(id,family_id,owner_user_id,subject_person_id,title,status)
    values(${literal(project)},${literal(source.family_id)},${literal(account.id)},${literal(person)},${literal(`Guard ${kind} QA`)},'active');
   insert into public.user_questions(id,user_id,book_project_id,question_id,sequence_order,chapter,status,is_active)
    values(${literal(question)},${literal(account.id)},${literal(project)},${literal(existingQuestion.question_id)},${sequence},'QA','answered',true);
   insert into public.answers(id,user_id,book_project_id,subject_person_id,speaker_person_id,user_question_id,question_id,sequence_order,transcript_edited)
    values(${literal(answer)},${literal(account.id)},${literal(project)},${literal(person)},${literal(person)},${literal(question)},${literal(existingQuestion.question_id)},${sequence},'Guard QA completed sentence');
   commit;`);
  const mainPath=`${account.id}/${project}/${answer}/part-01.wav`;
  const extraPath=kind==='one_invalid'
    ?`${account.id}/00000000-0000-4000-8000-000000000001/${answer}/photo-01.jpg`
    :`${account.id}/${project}/${answer}/photo-01.jpg`;
  for(const item of [
    {bucket:'audio',path:mainPath,bytes:audioBytes,contentType:'audio/wav',type:'audio',part:1},
    {bucket:'photos',path:extraPath,bytes:photoBytes,contentType:'image/jpeg',type:'photo',part:1}
  ]){
    await ok(admin.storage.from(item.bucket).upload(item.path,item.bytes,{contentType:item.contentType,upsert:false}));
    db(`insert into public.media_assets(answer_id,user_id,family_id,book_project_id,person_id,asset_type,storage_path,meta_json)
      values(${literal(answer)},${literal(account.id)},${literal(source.family_id)},${literal(project)},${literal(person)},
        ${literal(item.type)},${literal(item.path)},'${JSON.stringify({part:item.part,qa_fixture:true})}'::jsonb);`);
  }
  const selected=await ok(user.rpc('save_book_selection',{input_project_id:project,input_answer_ids:[answer],input_expected_revision:0}));
  const work=kind==='checkout_valid'?selected:await ok(user.rpc('confirm_book_work',{
    input_project_id:project,input_expected_revision:selected.revision,input_subject_confirmed:true}));
  assert.ok(work?.id);
  if(kind!=='checkout_valid')assert.ok(work.snapshot);
  results.push({kind,project,person,answer,workId:work.id});
  if(kind==='one_invalid'){
    const {data,error}=await user.functions.invoke('publish-voice-edition',{body:{action:'publish',bookProjectId:project}});
    assert.ok(error || data?.success===false);
    const publications=await ok(admin.from('voice_publications').select('id,status').eq('book_project_id',project));
    const shelf=await ok(admin.from('book_completion_candidates').select('id').eq('book_project_id',project).eq('state','completed'));
    assert.equal(publications.length,0);
    assert.equal(shelf.length,0);
    console.log(JSON.stringify({testOnly:true,case:'one_invalid',publishRejected:true,
      publications:0,shelf:0,productionChanged:false}));
  }
 }
 const output='output/web-book-e2e/source-guard-fixtures.json';
 fs.mkdirSync('output/web-book-e2e',{recursive:true,mode:0o700});
 fs.writeFileSync(output,JSON.stringify({ref,results},null,2),{mode:0o600});
 console.log(JSON.stringify({testOnly:true,goodFixtureReady:true,fixtureFile:output,
  projects:results.map(row=>({kind:row.kind,project:row.project})),productionChanged:false}));
}finally{await user.auth.stopAutoRefresh();}
