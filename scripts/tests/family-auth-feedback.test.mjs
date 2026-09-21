import test from 'node:test';
import assert from 'node:assert/strict';
import {familyAuthFeedback} from '../../src/lib/familyAuthFeedback.js';

test('OTP failure gives actionable feedback without claiming whether it was mistyped or expired',()=>{
  const text=familyAuthFeedback({code:'otp_expired'});
  assert.match(text,/無効か、有効期限/);
  assert.match(text,/最後に届いた/);
});
test('rate limiting and delivery failure are distinguished',()=>{
  assert.match(familyAuthFeedback({code:'over_sms_send_rate_limit'}),/時間をおいて/);
  assert.match(familyAuthFeedback({code:'sms_send_failed'}),/SMSを送信できません/);
});
test('arbitrary backend messages and codes never appear in feedback',()=>{
  const secret='private-test-secret';
  for(const error of [undefined,{message:secret},{code:secret,message:secret},{code:'otp_expired',message:secret}]){
    assert.ok(!familyAuthFeedback(error).includes(secret));
  }
});
