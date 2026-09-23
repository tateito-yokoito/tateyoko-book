// TEST-only admin Live Preview on an isolated media-bearing work.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const ref='zpswxefgfabzvxdbtyvq';
const project='38915ab4-98a1-4055-9a23-7a812a8ff963';
const account=JSON.parse(fs.readFileSync(process.env.QA_TEST_ACCOUNT_FILE,'utf8'));
assert.equal(account.ref,ref);assert.equal(account.id,'f6a3009c-d0ee-4872-8823-a931545b2a5a');
const raw=execFileSync(process.env.QA_SUPABASE_CLI,['projects','api-keys','--project-ref',ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=JSON.parse(raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1));
const anon=keys.find(key=>key.name==='anon'&&key.type==='legacy')?.api_key;
assert.ok(anon);
const client=createClient(`https://${ref}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false}});
try{
 const {data:auth,error:authError}=await client.auth.signInWithPassword({email:account.email,password:account.password});
 assert.ifError(authError);assert.equal(auth.user.id,account.id);
 const {data,error}=await client.functions.invoke('web-book-preview',{body:{projectId:project}});
 assert.ifError(error);assert.equal(data?.success,true);
 const media=data.snapshot.media||[];
 assert.equal(media.filter(row=>row.asset_type==='audio').length,2);
 assert.equal(media.filter(row=>row.asset_type==='photo').length,1);
 assert.ok(media.every(row=>row.url));
 for(const row of media){
  const response=await fetch(row.url,{method:'GET'});
  assert.equal(response.status,200);
  assert.ok(Number(response.headers.get('content-length')||0)>0);
 }
 console.log(JSON.stringify({testOnly:true,adminLivePreview:true,realAudioCount:2,realPhotoCount:1,signedAssetsFetched:true,productionChanged:false}));
}finally{await client.auth.stopAutoRefresh();}
