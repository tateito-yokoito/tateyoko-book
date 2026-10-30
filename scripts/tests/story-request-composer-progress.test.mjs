import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearStoryRequestProgress,
  readStoryRequestProgress,
  requestMatchesCreatingDraft,
  storyRequestProgressKey,
  writeStoryRequestProgress
} from '../../src/lib/storyRequestComposerProgress.js';

test('request draft survives reopening for the same project and theme only', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const key = storyRequestProgressKey('project-a', 'ty_theme_childhood');
  writeStoryRequestProgress(key, {
    status: 'editing', step: 'recipient', selected: ['source:question-a'],
    custom: '姉に聞きたいこと', recipientName: '誠', relationship: '姉'
  }, storage);
  assert.deepEqual(readStoryRequestProgress(key, storage), {
    status: 'editing', step: 'recipient', selected: ['source:question-a'],
    custom: '姉に聞きたいこと', recipientName: '誠', relationship: '姉',
    requestId: null, createStartedAt: null
  });
  assert.equal(readStoryRequestProgress(storyRequestProgressKey('project-b', 'ty_theme_childhood'), storage), null);
  clearStoryRequestProgress(key, storage);
  assert.equal(readStoryRequestProgress(key, storage), null);
});

test('an interrupted creation only matches the same request and questions', () => {
  const draft = {
    createStartedAt: '2026-10-30T10:00:00.000Z', recipientName: '誠', relationship: '姉',
    selected: ['source:question-a', 'extra:childhood-food'], custom: '覚えていることは？'
  };
  const request = {
    created_at: '2026-10-30T10:00:01.000Z', recipient_name: '誠', relationship_label: '姉',
    selected_questions: [
      { sourceQuestionId: 'question-a' },
      { sourceQuestionKey: 'extra:childhood-food' },
      { prompt: '覚えていることは？' }
    ]
  };
  assert.equal(requestMatchesCreatingDraft(request, draft), true);
  assert.equal(requestMatchesCreatingDraft({ ...request, created_at: '2026-10-29T10:00:00.000Z' }, draft), false);
  assert.equal(requestMatchesCreatingDraft({ ...request, selected_questions: [{ prompt: '違う質問' }] }, draft), false);
});
