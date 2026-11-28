import assert from 'node:assert/strict';
import test from 'node:test';
import { getThemeResumeContext } from '../../src/lib/themeResumeContext.js';

test('a pending optional introduction does not displace the next childhood question', () => {
  const questions = [
    { sequence_order: 1, onboarding_group: 'starting_conversation', theme_order: null, status: 'answered' },
    { sequence_order: 2, onboarding_group: 'starting_conversation', theme_order: null, status: 'answered' },
    { sequence_order: 3, onboarding_group: 'starting_conversation', theme_order: null, status: 'answered' },
    { sequence_order: 4, onboarding_group: 'starting_motivation', theme_order: null, status: 'pending' },
    { sequence_order: 5, theme_order: 1, status: 'answered' },
    { sequence_order: 6, theme_order: 1, status: 'answered' },
    { sequence_order: 7, theme_order: 1, status: 'pending' },
  ];

  const resume = getThemeResumeContext(questions, 4);
  assert.equal(resume?.theme.label, '幼い頃のこと');
  assert.equal(resume?.questionNumber, 3);
  assert.equal(resume?.questionIndex, 6);
});
