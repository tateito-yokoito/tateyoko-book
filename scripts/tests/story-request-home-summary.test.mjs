import assert from 'node:assert/strict';
import test from 'node:test';
import { storyRequestHomeSummary } from '../../src/lib/storyRequestHomeSummary.js';
import { countAnsweredStoryThemes } from '../../src/lib/storyPages.js';

test('an opened request stops showing as new while adopted answers remain counted', () => {
  const request = { recipient_name: '香世', submitted_at: '2026-11-08T00:00:00Z', owner_viewed_at: null, theme_memory_answer_records: [
    { publication_status: 'unreviewed', responder_name: '香世' },
    { publication_status: 'included', responder_name: '香世' }
  ] };
  assert.deepEqual(storyRequestHomeSummary([request]), { unviewedCount: 1, includedCount: 1, contributorCount: 1 });
  request.owner_viewed_at = '2026-11-08T00:00:00Z';
  assert.deepEqual(storyRequestHomeSummary([request]), { unviewedCount: 0, includedCount: 1, contributorCount: 1 });
  request.submitted_at = '2026-11-08T01:00:00Z';
  assert.deepEqual(storyRequestHomeSummary([request]), { unviewedCount: 1, includedCount: 1, contributorCount: 1 });
});

test('adopted answers from repeated invitations by the same named contributor count as one person', () => {
  const requests = [' 香世 ', '香 世'].map(responder_name => ({
    theme_memory_answer_records: [{ publication_status: 'included', responder_name }]
  }));
  assert.deepEqual(storyRequestHomeSummary(requests), { unviewedCount: 0, includedCount: 2, contributorCount: 1 });
});

test('the home theme count includes answered themes but excludes the opening bookend', () => {
  const questions = [
    { status: 'answered', theme_code: 'ty_theme_childhood' },
    { status: 'answered', theme_code: 'ty_theme_childhood' },
    { status: 'answered', theme_code: 'ty_theme_likes' },
    { status: 'pending', theme_code: 'ty_theme_work' },
    { status: 'answered', question_role: 'bookend_voice', bookend_kind: 'intro', onboarding_group: 'starting_conversation' }
  ];
  assert.equal(countAnsweredStoryThemes(questions), 2);
});
