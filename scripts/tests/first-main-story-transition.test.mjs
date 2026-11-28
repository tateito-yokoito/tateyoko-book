import test from 'node:test';
import assert from 'node:assert/strict';
import { getFirstMainStoryIndex, firstMainStoryTransitionState } from '../../src/lib/firstMainStoryQuestion.js';

test('paid introduction resumes at childhood after a reload', () => {
  const questions = [
    { flow_type: 'onboarding' },
    { flow_type: 'story', theme_order: 1, question_role: null },
    { flow_type: 'story', theme_order: 2, question_role: null },
  ];
  assert.equal(getFirstMainStoryIndex(questions), 1);
  assert.deepEqual(firstMainStoryTransitionState({
    bookend_intro_shown: true,
    pending_transition_order: 1,
    pending_transition_phase: 'intro',
  }), {
    bookend_intro_shown: true,
    pending_transition_order: null,
    pending_transition_phase: null,
  });
});
