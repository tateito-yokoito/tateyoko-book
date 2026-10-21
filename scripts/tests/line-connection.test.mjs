import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
const source = readFileSync('supabase/functions/line-connection/index.ts','utf8').replace(/^import.*\n/, '');
const {code} = await transform(source,{loader:'ts',format:'iife'});
async function run({ jwt=true, linked=true, friend=true, clientId='login', profileId='U'+'a'.repeat(32), action='check', preference=true, schedule=true, active=true, network=false }={}) {
  let handler; let writes=[]; let lineEnabled=false;
  const user={id:'test-user',identities:linked?[{provider:'custom:line',provider_id:'U'+'a'.repeat(32)}]:[]};
  const client={auth:{getUser:async()=>({data:{user},error:null})},from(table){
    let operation='read', patch;
    const query={select(){return query;},eq(){return query;},limit(){return query;},update(value){operation='update';patch=value;return query;},upsert(value){writes.push({table,value});return Promise.resolve({error:null});},maybeSingle(){return Promise.resolve({data:table==='line_notification_connections'?null:preference?{line_enabled:lineEnabled,is_active:active}:null,error:null});},then(resolve){if(operation==='update'){writes.push({table,value:patch});if(typeof patch.line_enabled==='boolean')lineEnabled=patch.line_enabled;}return Promise.resolve({data:table==='notification_schedules'?(schedule?[{id:'test-schedule'}]:[]):preference?[{user_id:user.id}]:[],error:null}).then(resolve);}};
    return query;
  }};
  vm.runInNewContext(code,{Deno:{env:{get:key=>({SUPABASE_URL:'test',SUPABASE_SERVICE_ROLE_KEY:'test',LINE_CHANNEL_ACCESS_TOKEN:'test',LINE_LOGIN_CHANNEL_ID:'login'})[key]},serve:f=>handler=f},createClient:()=>client,Response,Request,URL,AbortSignal,console,fetch:async url=>{
    if(network)throw Error('secret');
    const path=new URL(url).pathname;
    return new Response(JSON.stringify(path.includes('/verify')?{client_id:clientId}:path.includes('/friendship/')?{friendFlag:friend}:{userId:profileId}),{status:200});
  }});
  const response=await handler(new Request('https://test/',{method:'POST',headers:{'Content-Type':'application/json',...(jwt?{Authorization:'Bearer test'}:{})},body:JSON.stringify({action,provider_token:'test'})}));
  return {status:response.status,body:await response.json(),writes};
}
test('unauthenticated requests are rejected',async()=>assert.equal((await run({jwt:false})).status,401));
test('non-LINE accounts cannot claim a destination',async()=>assert.equal((await run({linked:false})).status,409));
test('wrong OAuth channel and different LINE identity are rejected',async()=>{
 assert.equal((await run({clientId:'other'})).status,401);
 assert.equal((await run({profileId:'U'+'b'.repeat(32)})).status,401);
});
test('check confirms friend but does not enable notifications',async()=>{
 const r=await run();assert.equal(r.body.status,'active');assert.equal(r.body.notification_enabled,false);assert.ok(!r.writes.some(x=>x.value.line_enabled===true));
});
test('non-friends never enable notifications',async()=>{
 const r=await run({friend:false,action:'enable'});assert.equal(r.body.status,'unavailable');assert.equal(r.body.notification_enabled,false);
});
test('missing preference cannot report successful enable',async()=>assert.equal((await run({action:'enable',preference:false})).status,409));
test('LINE cannot be enabled before an active schedule is saved',async()=>{
 for(const options of [{preference:false},{active:false},{schedule:false}]) {
   const r=await run({action:'enable',...options});
   assert.equal(r.status,409);
   assert.ok(!r.writes.some(x=>x.value.line_enabled===true));
 }
 const ready=await run({action:'enable'});
 assert.equal(ready.status,200);
 assert.equal(ready.body.notification_enabled,true);
 assert.ok(ready.writes.some(x=>x.value.line_enabled===true));
});
test('disable works without contacting LINE',async()=>{
 const r=await run({action:'disable',network:true});assert.equal(r.status,200);assert.equal(r.body.notification_enabled,false);
});
test('network failure does not leak tokens',async()=>{
 const r=await run({network:true});assert.equal(r.status,502);assert.ok(!JSON.stringify(r.body).includes('secret'));
});
