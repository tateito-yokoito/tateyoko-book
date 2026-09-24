// Remote TEST-only normal publication/copy regression on the isolated fixture.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const ref='zpswxefgfabzvxdbtyvq';
const fixture=JSON.parse(fs.readFileSync('output/web-book-e2e/source-guard-fixtures.json','utf8'));
assert.equal(fixture.ref,ref);
const project=fixture.results.find(row=>row.kind==='all_valid')?.project;
const badProject=fixture.results.find(row=>row.kind==='one_invalid')?.project;
assert.ok(project);
assert.ok(badProject);
const account=JSON.parse(fs.readFileSync(process.env.QA_TEST_ACCOUNT_FILE,'utf8'));
assert.equal(account.ref,ref);
const raw=execFileSync(process.env.QA_SUPABASE_CLI,['projects','api-keys','--project-ref',ref,'--output','json'],
  {encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const anon=keys.find(key=>key.name==='anon'&&key.type==='legacy')?.api_key;
const service=keys.find(key=>key.name==='service_role'&&key.type==='legacy')?.api_key;
assert.ok(anon&&service);
const url=`https://${ref}.supabase.co`;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const user=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=async p=>{const {data,error}=await p;assert.ifError(error);return data;};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
 const auth=await ok(user.auth.signInWithPassword({email:account.email,password:account.password}));
 assert.equal(auth.user.id,account.id);
 const bad=await user.functions.invoke('publish-voice-edition',{body:{action:'publish',bookProjectId:badProject}});
 assert.ok(bad.error||bad.data?.success===false);
 assert.equal((await ok(admin.from('voice_publications').select('id').eq('book_project_id',badProject))).length,0);
 const first=await user.functions.invoke('publish-voice-edition',{body:{action:'publish',bookProjectId:project}});
 if(first.error)throw new Error(JSON.stringify({status:first.error.context?.status,
  body:await first.error.context?.text?.().catch(()=>null)}));
 const response=first.data;
 assert.equal(response.success,true);
 const publication=await ok(admin.from('voice_publications').select('id,status,public_id').eq('book_project_id',project).single());
 assert.equal(publication.status,'published');
 const items=await ok(admin.from('voice_publication_items').select('audio_assets,photo_assets,transcript_text').eq('publication_id',publication.id));
 assert.equal(items.length,1);
 assert.equal(items[0].audio_assets.length,1);
 assert.equal(items[0].photo_assets.length,1);
 for(const [bucket,asset] of [['audio',items[0].audio_assets[0]],['photos',items[0].photo_assets[0]]]){
  const source=await ok(admin.from('media_assets').select('storage_path').eq('id',asset.sourceMediaId).single());
  const [original,completed]=await Promise.all([
   admin.storage.from(bucket).download(source.storage_path),admin.storage.from(bucket).download(asset.storagePath)
  ]);
  assert.ifError(original.error);assert.ifError(completed.error);
  assert.equal(hash(Buffer.from(await original.data.arrayBuffer())),hash(Buffer.from(await completed.data.arrayBuffer())));
 }
 const again=await ok(user.functions.invoke('publish-voice-edition',{body:{action:'publish',bookProjectId:project}}));
 assert.equal(again.unchanged,true);
 assert.equal(again.publicId,publication.public_id);
 console.log(JSON.stringify({testOnly:true,normalPublish:true,audioCopied:true,photoCopied:true,
  onePublication:true,retryStable:true,publicIdStable:true,productionChanged:false}));
}finally{await user.auth.stopAutoRefresh();}
