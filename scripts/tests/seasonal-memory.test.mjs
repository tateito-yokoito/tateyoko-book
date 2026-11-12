import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonalBoxes, hasSeasonalContent, markSeasonalWelcomeSeen, seasonalWelcomeSeen } from '../../src/lib/seasonalMemory.js';

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

test('a Web book published mid-season opens the current box immediately', () => {
  const boxes = seasonalBoxes(new Date('2027-08-18T03:00:00Z'));
  assert.equal(boxes.current.start, '2027-07-01');
  assert.equal(boxes.current.months, '7月〜9月');
  assert.equal(boxes.previous, null);
  const grace = seasonalBoxes(new Date('2027-10-18T03:00:00Z'));
  assert.equal(grace.previous.start, '2027-07-01');
  assert.equal(grace.previous.graceDays, 13);
});

test('welcome dismissal is stored on the account and survives a new client', async () => {
  const account = { user_metadata: {} };
  const firstDevice = { auth: { updateUser: async ({ data }) => {
    Object.assign(account.user_metadata, data);
    return { data: { user: account }, error: null };
  } } };
  assert.equal(seasonalWelcomeSeen(account), false);
  await markSeasonalWelcomeSeen(firstDevice);
  const secondDeviceUser = structuredClone(account);
  assert.equal(seasonalWelcomeSeen(secondDeviceUser), true);
  assert.equal(Boolean(secondDeviceUser.user_metadata.seasonal_memory_welcome_seen_at), true);
});

test('failed welcome update does not claim that dismissal was saved', async () => {
  const account = { user_metadata: {} };
  await assert.rejects(markSeasonalWelcomeSeen({ auth: { updateUser: async () => ({ error: new Error('offline') }) } }), /offline/);
  assert.equal(seasonalWelcomeSeen(account), false);
});
