import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { answerEntryScene } from '../../src/lib/answerEntryScene.js';

test('every question entry shows voice and text choice before microphone access', () => {
  assert.equal(answerEntryScene('question'), 1);
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /onStart=\{\(\) => setScene\(answerEntryScene\("question"\)\)\}/);
  assert.match(app, /onNext=\{\(\) => setScene\(answerEntryScene\("question"\)\)\}/);
  assert.equal((app.match(/: answerEntryScene\("question"\);/g) || []).length, 2);
});

test('microphone check happens only after choosing to record', () => {
  assert.equal(answerEntryScene('record'), 'recording_mic_check');
  assert.equal(answerEntryScene('record', true), 3);
  assert.throws(() => answerEntryScene('unknown'));
});
