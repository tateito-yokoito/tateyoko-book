import assert from 'node:assert/strict';
import test from 'node:test';
import { themeExtraOptions } from '../../src/lib/themeExtras.js';
import { selectedMoreOptions } from '../../src/lib/themeMore.js';

test('theme extras stay optional, and previously added questions are not offered again', () => {
  const code = 'ty_theme_childhood';
  const initial = themeExtraOptions(code, []);
  assert.ok(initial.some(option => option.id === 'childhood-food'));
  const afterAdding = themeExtraOptions(code, [{ theme_extra_id: 'childhood-food' }]);
  assert.equal(afterAdding.some(option => option.id === 'childhood-food'), false);
  const picked = selectedMoreOptions(afterAdding, ['childhood-season']);
  assert.deepEqual(picked.map(option => option.id), ['childhood-season']);
  assert.ok(afterAdding.some(option => option.kind === 'free'));
});
