import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://zpswxefgfabzvxdbtyvq.supabase.co',FAMILY_TEST_ENABLED:'true'})[key]}};
const compiled=await build({entryPoints:['supabase/functions/_shared/family-access.ts'],bundle:true,write:false,format:'esm'});
const code=compiled.outputFiles[0].text;
const {familyPendingVoiceScope}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const upload='10000000-0000-4000-8000-000000000001';
test('legacy requests do not gain a family processing capability',async()=>{
 assert.equal(await familyPendingVoiceScope({rpc(){throw Error('must not run');}},{},'actor'),null);
});
test('draft scope is server-bound to actor, project and exact reservation ids',async()=>{
 const calls=[];
 const result=await familyPendingVoiceScope({async rpc(name,args){calls.push({name,args});return{data:name==='family_pending_voice_scope'?{paths:['one'],subject:false}:true};}},
  {familyUploadIds:[upload],answerId:upload,bookProjectId:'mother-project'},'daughter');
 assert.deepEqual(result,{paths:['one'],subject:false});
 assert.deepEqual(calls,[{name:'family_managed',args:{p:'mother-project'}},{name:'family_release_actor_allowed',args:{p:'mother-project',u:'daughter'}},{name:'family_pending_voice_scope',args:{p:'mother-project',actor:'daughter',uploads:[upload]}}]);
});
test('cannot substitute existing answer, repeat ids, omit reservations, or ignore denial',async()=>{
 const never={rpc(){throw Error('must not run');}};
 for(const body of [{familyUploadIds:[]},{familyUploadIds:[upload,upload],answerId:upload},{familyUploadIds:[upload],answerId:'private-answer'}]){
  await assert.rejects(()=>familyPendingVoiceScope(never,body,'daughter'),/Forbidden/);
 }
 await assert.rejects(()=>familyPendingVoiceScope({async rpc(){return{error:Error('denied')};}},{familyUploadIds:[upload],answerId:upload},'daughter'),/Forbidden|release/);
});
