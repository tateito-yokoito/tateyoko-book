import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyLineSignature,lineFriendshipEvents} from '../../supabase/functions/_shared/lineWebhook.js';
const body='{"events":[],"text":"日本語\\nテスト"}';
const bytes=new TextEncoder().encode(body);
const signature=createHmac('sha256','test-only-secret').update(bytes).digest('base64');
test('webhook verifies exact UTF-8 bytes',async()=>assert.equal(await verifyLineSignature(bytes,signature,'test-only-secret'),true));
test('tampering, wrong secret and missing signature are rejected',async()=>{
  assert.equal(await verifyLineSignature(new TextEncoder().encode(body+' '),signature,'test-only-secret'),false);
  assert.equal(await verifyLineSignature(bytes,signature,'other'),false);
  assert.equal(await verifyLineSignature(bytes,'','test-only-secret'),false);
});
test('only user friendship state is retained, in event order',()=>{
  const source={type:'user',userId:'U'+'a'.repeat(32)};
  const events=lineFriendshipEvents({events:[{type:'unfollow',timestamp:2,source},{type:'message',timestamp:1,source,message:{text:'private'}},{type:'follow',timestamp:1,source,replyToken:'private'}]});
  assert.deepEqual(events,[{lineUserId:source.userId,status:'active',timestamp:1},{lineUserId:source.userId,status:'blocked',timestamp:2}]);
  assert.ok(!JSON.stringify(events).includes('private'));
});
test('unknown sources and invalid timestamps cannot change connection state',()=>{
  assert.deepEqual(lineFriendshipEvents({events:[{type:'follow',source:{type:'group'},timestamp:1},{type:'follow',source:{type:'user',userId:'U'+'a'.repeat(32)},timestamp:NaN}]}),[]);
  assert.throws(()=>lineFriendshipEvents({}));
});
