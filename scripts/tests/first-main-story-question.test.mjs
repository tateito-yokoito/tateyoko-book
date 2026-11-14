import test from 'node:test';
import assert from 'node:assert/strict';
import { getFirstMainStoryIndex } from '../../src/lib/firstMainStoryQuestion.js';

test('completed opening conversation does not restart when entering the first theme', () => {
  const questions = [
    { flow_type: 'onboarding', onboarding_group: 'starting_conversation', include_in_story_list: true, status: 'answered' },
    { flow_type: 'onboarding', onboarding_group: 'starting_conversation', include_in_story_list: true, status: 'answered' },
    { flow_type: 'onboarding', onboarding_group: 'starting_motivation', include_in_story_list: true, status: 'pending' },
    { flow_type: 'story', theme_order: 1, include_in_story_list: true, status: 'pending' }
  ];
  assert.equal(getFirstMainStoryIndex(questions), 3);
});

test('legacy first story role remains supported without themed story metadata', () => {
  assert.equal(getFirstMainStoryIndex([
    { flow_type: 'onboarding' },
    { question_role: 'first_story', flow_type: 'story' }
  ]), 1);
});
