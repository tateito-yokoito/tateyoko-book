import assert from 'node:assert/strict';
import test from 'node:test';
import { nextThemeQuestion } from '../../src/lib/nextThemeQuestion.js';

test('extra question appended after the main sequence resumes at the next theme', () => {
  const questions = [
    { sequence_order: 4, theme_order: 1, status: 'answered' },
    { sequence_order: 5, theme_order: 2, status: 'pending' },
    { sequence_order: 27, theme_order: 1, question_role: 'theme_extra', status: 'answered' },
  ];
  assert.deepEqual(nextThemeQuestion(questions, 1), { index: 1, sequenceOrder: 5 });
});

test('a completed or skipped question is not reopened', () => {
  const questions = [
    { sequence_order: 5, theme_order: 2, status: 'answered' },
    { sequence_order: 6, theme_order: 2, status: 'skipped' },
    { sequence_order: 7, theme_order: 2, status: 'pending' },
  ];
  assert.deepEqual(nextThemeQuestion(questions, 1), { index: 2, sequenceOrder: 7 });
});
