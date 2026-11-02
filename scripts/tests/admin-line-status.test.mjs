import assert from 'node:assert/strict';
import { lineConnectionLabel, lineDeliveryLabel } from '../../src/admin/lineStatus.js';

assert.equal(lineConnectionLabel(null), '配信先は未接続');
assert.equal(lineConnectionLabel('active'), '配信先を確認済み');
assert.equal(lineConnectionLabel('reachable_unconfirmed'), '配信先の確認待ち');

const ready = { linked: true, connection_status: 'active', preference_configured: true, line_enabled: true, delivery_active: true };
assert.equal(lineDeliveryLabel(ready), '配信設定オン');
assert.equal(lineDeliveryLabel({ ...ready, linked: false }), '配信不可（LINE未連携）');
assert.equal(lineDeliveryLabel({ ...ready, connection_status: 'unavailable' }), '配信不可（配信先未確認）');
assert.equal(lineDeliveryLabel({ ...ready, line_enabled: false }), '配信オフ');
assert.equal(lineDeliveryLabel({ ...ready, delivery_active: false }), '配信停止中');
assert.equal(lineDeliveryLabel(null), '取得できません');
