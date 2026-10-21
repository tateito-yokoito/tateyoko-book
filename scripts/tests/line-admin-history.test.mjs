import assert from 'node:assert/strict';
import { deliveryChannelText, deliveryDestinationText } from '../../src/admin/projectHistory.js';

assert.equal(deliveryChannelText('line'), 'LINE');
assert.equal(deliveryDestinationText({ delivery_channel: 'line', recipient_email: 'other@example.test' }), 'LINEの連携先');
assert.equal(deliveryDestinationText({ delivery_channel: 'sms' }), 'SMS送信先（番号は連絡先で確認）');
assert.equal(deliveryDestinationText({ delivery_channel: 'email', recipient_email: 'person@example.test' }), 'person@example.test');
console.log('PASS LINE delivery history uses LINE labels without exposing a misleading email recipient');
