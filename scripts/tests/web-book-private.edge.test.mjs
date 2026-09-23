import {build} from 'esbuild';
import assert from 'node:assert/strict';
const {outputFiles}=await build({entryPoints:['supabase/functions/public-voice/index.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'edge-fixture',setup(b){
 b.onResolve({filter:/^https:\/\//},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.includes('supabase-js')?'export const createClient=(...args)=>globalThis.makeClient(...args);':'export const serve=handler=>{globalThis.handler=handler};'}));
}}]});
const publication={id:'publication',book_project_id:'project',public_id:'a'.repeat(48),status:'disabled',published_at:'2026-09-23T00:00:00Z',access_mode:'code',snapshot_metadata:{},video_assets:[]};
const env={SUPABASE_URL:'https://zpswxefgfabzvxdbtyvq.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-secret'};
globalThis.Deno={env:{get:key=>env[key]}};
let allowed=false,reviewAllowed=false,rateAllowed=true,calls=[];
globalThis.makeClient=(_url,_key,options)=>({
 auth:{getUser:async()=>({data:{user:options?.global?.headers?.Authorization==='Bearer fixture-user'?{id:'user'}:null}})},
 from:table=>{
  const query={select(){return query;},eq(){return query;},in(){return query;},order(){return query;},maybeSingle:async()=>({data:table==='voice_publications'?publication:null}),then:(r,j)=>Promise.resolve({data:table==='voice_publication_items'?[{item_order:1,transcript_text:'A completed story',audio_assets:[],photo_assets:[]}]:[]}).then(r,j)};
  return query;
 },
 rpc:async name=>{
  calls.push(name);
  if(name==='can_read_private_web_book')return {data:allowed};
  if(name==='admin_customer_can_read_publication')return {data:reviewAllowed};
  if(name==='family_managed')return {data:false};
  if(name.startsWith('register_'))return {data:[{allowed:rateAllowed,retry_after_seconds:600}]};
  throw Error('Unexpected RPC '+name);
 }
});
await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const request=async(user=false,extra={})=>{
 calls=[];
 return globalThis.handler(new Request('https://fixture.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer fixture-user'}:{})},body:JSON.stringify({publicId:publication.public_id,...extra})}));
};
try{
 assert.equal((await request(false,{accessCode:'1234',accessToken:'old-session'})).status,404);
 assert.equal(calls.length,0,'anonymous cannot rate/register/unlock a disabled work');
 assert.equal((await request(true)).status,404,'viewer/payer/revoked supporter denied');
 assert.equal((await request(false,{reviewTargetId:'target'})).status,404,'review needs an authenticated administrator');
 assert.equal((await request(true,{reviewTargetId:'target'})).status,404,'administrator needs target-specific entitlement');
 reviewAllowed=true;
 let reviewed=await request(true,{reviewTargetId:'target'});
 assert.equal(reviewed.status,200,'entitled read-only customer review can open a stopped work');
 assert.ok(calls.includes('admin_customer_can_read_publication'));
 reviewAllowed=false;
 allowed=true;
 let response=await request(true);assert.equal(response.status,200,JSON.stringify({body:await response.clone().json(),calls}));assert.equal((await response.json()).success,true);
 assert.ok(calls.includes('register_private_web_book_request'));
 assert.ok(!calls.includes('register_voice_publication_request'));
 rateAllowed=false;assert.equal((await request(true)).status,429);
 rateAllowed=true;publication.published_at=null;assert.equal((await request(true)).status,404,'never-published draft cannot enter private shelf');
 publication.published_at='2026-09-23T00:00:00Z';publication.status='published';publication.access_mode='link';
 response=await request(false);assert.equal((await response.json()).success,true);
 assert.ok(calls.includes('register_voice_publication_request'),'anonymous public circuit breaker unchanged');
 console.log('PASS actual public-voice handler: disabled anonymous/PIN/token/viewer denied, creator private read, separate private throttle, unpublished denied, published legacy route preserved');
}finally{delete globalThis.handler;delete globalThis.makeClient;delete globalThis.Deno;}
