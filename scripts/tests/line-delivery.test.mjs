import test from 'node:test';
import assert from 'node:assert/strict';
import { lineQuestionMessage, sendLineQuestion } from '../../supabase/functions/_shared/lineDelivery.js';
const args = {token:'test-only',recipient:'U'+'a'.repeat(32),question:'幼い頃の思い出は？',questionUrl:'https://example.com/?token=opaque',retryKey:'123e4567-e89b-12d3-a456-426614174000'};
test('one message carries the question and external-browser link',()=>{
  const m=lineQuestionMessage(args.question,args.questionUrl);
  assert.match(m.text,/幼い頃/); assert.match(m.text,/token=opaque&openExternalBrowser=1/);
  assert.throws(()=>lineQuestionMessage('question','http://example.com'));
});
test('push sends one recipient with retry key',async()=>{
  const result=await sendLineQuestion({...args,fetcher:async(url,options)=>{
    assert.equal(url,'https://api.line.me/v2/bot/message/push');
    assert.equal(options.headers['X-Line-Retry-Key'],args.retryKey);
    assert.equal(JSON.parse(options.body).messages.length,1);
    assert.equal(JSON.parse(options.body).to,args.recipient);
    return new Response('{}',{status:200,headers:{'x-line-request-id':'accepted'}});
  }}); assert.equal(result.providerMessageId,'accepted');
});
test('duplicate accepted request is not sent again',async()=>{
  const result=await sendLineQuestion({...args,fetcher:async()=>new Response('{}',{status:409,headers:{'x-line-accepted-request-id':'original'}})});
  assert.equal(result.providerMessageId,null);
  assert.equal(result.providerStatus,'accepted_duplicate');
});
test('limits and network failures are safe and do not leak provider contents',async()=>{
  await assert.rejects(sendLineQuestion({...args,fetcher:async()=>new Response('secret echo',{status:429})}),e=>e.code==='LINE_429'&&!e.message.includes('secret'));
  await assert.rejects(sendLineQuestion({...args,fetcher:async()=>{throw Error('secret token');}}),e=>e.code==='LINE_NETWORK'&&!e.message.includes('secret'));
});
