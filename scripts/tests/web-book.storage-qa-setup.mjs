// One isolated TEST-only project: upload genuine Storage files and attach them
// to an existing synthetic answer. No production or existing customer rows.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';

const ref='zpswxefgfabzvxdbtyvq';
const project='38915ab4-98a1-4055-9a23-7a812a8ff963';
const answer='4b332f6d-fee3-46c1-bc21-a34a8a304461';
const person='4050c701-d78d-4fb8-80c0-bec92e90821d';
const account=JSON.parse(fs.readFileSync(process.env.QA_TEST_ACCOUNT_FILE,'utf8'));
assert.equal(account.ref,ref);assert.equal(account.id,'f6a3009c-d0ee-4872-8823-a931545b2a5a');
const raw=execFileSync(process.env.QA_SUPABASE_CLI,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const service=keys.find(key=>key.name==='service_role'&&key.type==='legacy')?.api_key;
assert.ok(service);
const admin=createClient(`https://${ref}.supabase.co`,service,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:p,error:pError}=await admin.from('book_projects').select('id,owner_user_id,subject_person_id').eq('id',project).single();
assert.ifError(pError);assert.equal(p.owner_user_id,account.id);assert.equal(p.subject_person_id,person);
const {data:a,error:aError}=await admin.from('answers').select('id,book_project_id').eq('id',answer).single();
assert.ifError(aError);assert.equal(a.book_project_id,project);
const {data:work,error:wError}=await admin.from('book_work_manifests').select('id,confirmed_at').eq('book_project_id',project).single();
assert.ifError(wError);assert.equal(work.confirmed_at,null);

const root=`${account.id}/qa-web-book-media-20260924`;
const media=[
 {bucket:'audio',path:`${root}/main.wav`,file:'public/site/hp-renewal/sample-voice.wav',type:'audio',contentType:'audio/wav',part:1},
 {bucket:'audio',path:`${root}/addition.wav`,file:'public/site/trial-demo-voice.wav',type:'audio',contentType:'audio/wav',part:2},
 {bucket:'photos',path:`${root}/photo.jpg`,file:'public/site/hero-book.jpg',type:'photo',contentType:'image/jpeg',part:1},
];
for(const item of media){
 const {error:uploadError}=await admin.storage.from(item.bucket).upload(item.path,fs.readFileSync(item.file),{contentType:item.contentType,upsert:false});
 assert.ifError(uploadError);
 const {data:row,error:rowError}=await admin.from('media_assets').insert({
  answer_id:answer,user_id:account.id,book_project_id:project,person_id:person,
  asset_type:item.type,storage_path:item.path,is_primary:item.part===1,
  meta_json:{part:item.part,duration_seconds:item.type==='audio'?6.5:null,qa_fixture:true}
 }).select('id').single();
 assert.ifError(rowError);
 console.log(JSON.stringify({testOnly:true,asset:item.type,part:item.part,storageUploaded:true,mediaId:row.id}));
}
