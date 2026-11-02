import assert from 'node:assert/strict';
import { deliveryChannelText, deliveryDestinationText } from '../../src/admin/projectHistory.js';

assert.equal(deliveryChannelText('line'), 'LINE');
assert.equal(deliveryDestinationText({ delivery_channel: 'line', recipient_email: 'other@example.test' }), 'LINE連携先（利用アカウント：other@example.test）');
assert.equal(deliveryDestinationText({ delivery_channel: 'line' }), 'LINE連携先（利用アカウント未記録）');
assert.equal(deliveryDestinationText({ delivery_channel: 'sms' }), 'SMS送信先（番号は連絡先で確認）');
assert.equal(deliveryDestinationText({ delivery_channel: 'email', recipient_email: 'person@example.test' }), 'person@example.test');
console.log('PASS LINE delivery history identifies the account without calling its email the delivery destination');
