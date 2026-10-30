import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildTrialStories, trialIsReady } from '../../src/lib/trialConversion.js';

const questions = [1, 2, 3].map(number => ({ user_question_id: `trial-${number}`, content: `問い${number}` }));
const answer = (number, text) => ({ id: `answer-${number}`, book_project_id: 'project-a',
  subject_person_id: 'person-a', user_question_id: `trial-${number}`, transcript_edited: text });

test('three written trial answers remain ready without audio and cannot borrow another project', () => {
  const stories = buildTrialStories({ projectId: 'project-a', personId: 'person-a', questions,
    answers: [answer(1, '一問目'), answer(2, '二問目'), answer(3, '三問目'),
      { ...answer(2, '他の作品'), book_project_id: 'project-b' }], media: [] });
  assert.deepEqual(stories.map(story => story.state), ['ready', 'ready', 'ready']);
  assert.equal(trialIsReady(stories), true);
  assert.deepEqual(stories.map(story => story.text), ['一問目', '二問目', '三問目']);
});

test('a mix of voice and text needs all three saved answers', () => {
  const media = [{ answer_id: 'answer-2', asset_type: 'audio', storage_path: 'user/project/audio-2.m4a' }];
  const stories = buildTrialStories({ projectId: 'project-a', personId: 'person-a', questions,
    answers: [answer(1, '文字'), answer(2, ''), answer(3, '三問目')], media });
  assert.deepEqual(stories.map(story => story.state), ['ready', 'text_pending', 'ready']);
  assert.equal(trialIsReady(stories), true);
  const missing = buildTrialStories({ projectId: 'project-a', personId: 'person-a', questions,
    answers: [answer(1, '文字'), answer(2, '')], media });
  assert.equal(trialIsReady(missing), false);
});


test('written trial retention respects the same disabled switch as audio', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/202610300001_align_written_trial_retention_feature_flag.sql', import.meta.url), 'utf8');
  const guard = sql.indexOf('if not coalesce((select enabled');
  const firstWrite = sql.indexOf('insert into public.free_trial_attempts');
  assert.ok(guard > 0 && firstWrite > guard, 'disabled retention must return before a deadline is created');
});
