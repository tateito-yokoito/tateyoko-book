import test from 'node:test';
import assert from 'node:assert/strict';
import {createFamilyApi,japaneseMobile,familyInvitationUrl,canProduce} from '../../src/lib/familyConnection.js';
test('progress mode never grants or removes production authority',()=>{
 for(const production_mode of ['self','supporter',null]){
  assert.equal(canProduce({role:'supporter',can_produce:true,production_mode}),true);
  assert.equal(canProduce({role:'supporter',can_produce:false,production_mode}),false);
  assert.equal(canProduce({role:'viewer',can_produce:true,production_mode}),false);
 }
});
test('phone normalization does not invent an email identity',()=>{
 assert.equal(japaneseMobile('０９０-００００-０００２'),'+819000000002');
 assert.equal(japaneseMobile('+81 90 0000 0002'),'+819000000002');
 for(const value of ['','03-1234-5678','+1 5550000000','0900000000','09000000002extra'])assert.throws(()=>japaneseMobile(value));
});
test('TEST-only API refuses production and untrusted hosts',()=>{
 for(const host of ['wquxjeqkumossjxehdop.supabase.co','zpswxefgfabzvxdbtyvq.supabase.co.evil.invalid'])assert.throws(()=>createFamilyApi({supabaseUrl:'https://'+host}));
});
test('invitation carries only opaque token in fragment, not phone/query',()=>{
 const url=new URL(familyInvitationUrl('https://test.invalid','a'.repeat(64)));
 assert.equal(url.hash,'#connect='+'a'.repeat(64));assert.equal(url.search,'?app=1&family_connect=1');
 assert.throws(()=>familyInvitationUrl('https://test.invalid','invalid'));
});
test('uploads and commits use reservation identity; no direct source row writes',async()=>{
 const calls=[];
 const client={supabaseUrl:'https://zpswxefgfabzvxdbtyvq.supabase.co',
 async rpc(name,args){calls.push([name,args]);return {data:name==='family_reserve_upload'?{id:'upload',path:'family/project/actor/uuid.mp4',bucket:'audio'}:'answer'};},
 storage:{from(bucket){return {async upload(path,blob,options){calls.push(['upload',{bucket,path,size:blob.size,options}]);return {};}};}}};
 const api=createFamilyApi(client),u=await api.reserve('project',new Blob(['fixture'],{type:'audio/mp4'}),'audio');
 await api.commitRecording(u,'question','first');await api.commitRecording(u,'question','first');
 assert.equal(calls.filter(([name])=>name==='family_reserve_upload').length,1);
 assert.deepEqual(calls.at(-1),calls.at(-2));
 assert.equal(calls.at(-1)[1].share,false);
 assert.equal(calls[1][1].options.upsert,false);
 await api.reserve('project',new Blob(['fixture'],{type:'audio/x-m4a'}),'audio');
 assert.equal(calls.at(-1)[1].options.contentType,'audio/mp4');
 assert.equal(calls.at(-2)[1].extension,'mp4');
 await assert.rejects(()=>api.reserve('project',new Blob([],{type:'audio/mp4'}),'audio'));
 await assert.rejects(()=>api.reserve('project',new Blob(['x'],{type:'text/html'}),'photo'));
});
test('DB errors propagate; UI must not mark a denied save complete',async()=>{
 const api=createFamilyApi({supabaseUrl:'https://zpswxefgfabzvxdbtyvq.supabase.co',rpc:async()=>({error:Error('Forbidden')})});
 await assert.rejects(()=>api.claim('a'.repeat(64),true),/Forbidden/);
});
