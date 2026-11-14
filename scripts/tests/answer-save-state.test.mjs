import test from 'node:test';
import assert from 'node:assert/strict';
import { bookTextSaveState, canCompleteSavedAnswer } from '../../src/lib/answerSaveState.js';

test('a BOOK device draft is not a completed server save', () => {
  assert.equal(bookTextSaveState({ remoteStatus: 'saved', dirty: true, syncPhase: 'waiting' }), 'saving');
  assert.equal(bookTextSaveState({ remoteStatus: 'device_only', dirty: true, syncPhase: 'failed' }), 'failed');
  assert.equal(bookTextSaveState({ remoteStatus: 'saved', dirty: false, syncPhase: 'idle' }), 'saved');
  assert.equal(bookTextSaveState({ remoteStatus: 'saved', conflict: { kind: 'answer' } }), 'conflict');
});

test('completion waits for every input and media acknowledgement', () => {
  const saved = { hasContent: true, saveState: 'saved' };
  assert.equal(canCompleteSavedAnswer(saved), true);
  assert.equal(canCompleteSavedAnswer({ ...saved, pendingMedia: 1 }), false);
  assert.equal(canCompleteSavedAnswer({ ...saved, dirty: true }), false);
  assert.equal(canCompleteSavedAnswer({ ...saved, busy: true }), false);
  assert.equal(canCompleteSavedAnswer({ ...saved, saveState: 'failed' }), false);
  assert.equal(canCompleteSavedAnswer({ ...saved, hasContent: false }), false);
});
