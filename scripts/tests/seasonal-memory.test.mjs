import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonalBoxes, hasSeasonalContent } from '../../src/lib/seasonalMemory.js';

test('JST quarter opens at local midnight, not UTC midnight', () => {
  const before = seasonalBoxes(new Date('2027-09-30T14:59:59Z'));
  const after = seasonalBoxes(new Date('2027-09-30T15:00:00Z'));
  assert.equal(before.current.start, '2027-07-01');
  assert.equal(after.current.start, '2027-10-01');
  assert.equal(after.previous.start, '2027-07-01');
  assert.equal(after.previous.graceDays, 30);
  assert.equal(seasonalBoxes(new Date('2027-10-04T15:00:00Z')).previous.graceDays, 26);
});

test('grace ends after the full first month, including year boundaries', () => {
  assert.equal(seasonalBoxes(new Date('2027-01-31T14:59:59Z')).previous.graceDays, 0);
  assert.equal(seasonalBoxes(new Date('2027-01-31T15:00:00Z')).previous, null);
  assert.equal(seasonalBoxes(new Date('2027-10-30T15:00:00Z')).previous.graceDays, 0);
  assert.equal(seasonalBoxes(new Date('2027-10-31T15:00:00Z')).previous, null);
});

test('a photo-only memory is content; an empty draft is not', () => {
  assert.equal(hasSeasonalContent({body:'',transcript_raw:''},[]), false);
  assert.equal(hasSeasonalContent({body:'',transcript_raw:''},[{kind:'photo'}]), true);
  assert.equal(hasSeasonalContent({body:'  ',transcript_raw:'語り'},[]), true);
});
