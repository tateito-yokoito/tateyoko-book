import assert from 'node:assert/strict';
import test from 'node:test';
import { canFinalizeBookAsSupportRole } from '../../src/lib/supportRole.js';

test('only the production manager and co-manager may finalize a supported BOOK', () => {
  assert.equal(canFinalizeBookAsSupportRole('facilitator'), true);
  assert.equal(canFinalizeBookAsSupportRole('co_manager'), true);
  assert.equal(canFinalizeBookAsSupportRole('supporter'), false);
  assert.equal(canFinalizeBookAsSupportRole(null), false);
});
