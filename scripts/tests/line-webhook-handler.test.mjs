import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { lineFriendshipEvents, verifyLineSignature } from '../../supabase/functions/_shared/lineWebhook.js';

const source = readFileSync('supabase/functions/line-webhook/index.ts','utf8').replace(/^import.*\n/gm, '');
const {code} = await transform(source,{loader:'ts',format:'iife'});
const userId='U'+'a'.repeat(32);
const userUuid='00000000-0000-4000-8000-000000000001';
function mock() {
  let handler; const writes=[];
  const admin={from(table){let patch,selected=false,filter;
    const query={update(value){patch=value;return query;},eq(field,value){if(field==='line_user_id')filter=value;return query;},lte(){return query;},select(){selected=true;return query;},then(resolve){
      writes.push({table,patch,filter});
      return Promise.resolve({data:selected?[{user_id:userUuid}]:null,error:null}).then(resolve);
    }};
    return query;
  }};
  vm.runInNewContext(code,{Deno:{env:{get:key=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-test',LINE_MESSAGING_CHANNEL_SECRET:'test-only-secret'})[key]},serve:f=>handler=f},createClient:()=>admin,lineFriendshipEvents,verifyLineSignature,Response,Request,Uint8Array,TextDecoder,Date,Number,JSON});
  return {handler,writes};
}
async function post(handler,body,valid=true) {
  const raw=JSON.stringify(body);
  const signature=createHmac('sha256',valid?'test-only-secret':'wrong').update(raw).digest('base64');
  return handler(new Request('https://test/',{method:'POST',headers:{'x-line-signature':signature},body:raw}));
}
test('unsigned and invalid webhooks are rejected before any writes',async()=>{
  const {handler,writes}=mock();
  assert.equal((await post(handler,{events:[]},false)).status,401);
  assert.deepEqual(writes,[]);
});
test('only linked user follow/unfollow state is written; message body is ignored',async()=>{
  const {handler,writes}=mock();
  const source={type:'user',userId};
  const res=await post(handler,{events:[{type:'message',source,timestamp:3,message:{text:'private text'}},{type:'follow',source,timestamp:4},{type:'unfollow',source,timestamp:5}]});
  assert.equal(res.status,200);
  assert.equal(writes.length,3);
  assert.equal(writes[0].patch.status,'active');
  assert.equal(writes[1].patch.status,'blocked');
  assert.equal(writes[2].patch.line_enabled,false);
  assert.ok(!JSON.stringify(writes).includes('private text'));
});
