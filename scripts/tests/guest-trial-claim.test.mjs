import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  claimGuestTrialForProject, guestTrialClaimRequested, guestTrialPurchaseUrl,
} from '../../src/lib/guestTrialClaim.js';
import { buildStorySections } from '../../src/lib/storyPages.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const token = 'a'.repeat(64);
const saved = JSON.stringify({ token, expiresAt: new Date(Date.now() + 86400000).toISOString() });
const storage = { getItem: key => key === 'tateyoko:guest-trial:self:v1' ? saved : null };

test('purchase return keeps the guest capability out of the URL', () => {
  const url = guestTrialPurchaseUrl({ origin: 'https://example.test' });
  assert.equal(new URL(url).searchParams.get('entry'), 'purchase');
  assert.equal(guestTrialClaimRequested(new URL(url).search), true);
  assert.equal(url.includes(token), false);
});

test('the authenticated claim sends the same-device capability once to the claim endpoint', async () => {
  const calls = [];
  const client = { functions: { invoke: async (name, input) => {
    calls.push({ name, input });
    return { data: { status: 'claimed', projectId, count: 3 }, error: null };
  } } };
  const result = await claimGuestTrialForProject(client, projectId, storage);
  assert.equal(result.count, 3);
  assert.deepEqual(calls, [{ name: 'claim-guest-trial',
    input: { body: { sessionToken: token, projectId } } }]);
});

test('a missing local capability never calls the server', async () => {
  let called = false;
  const client = { functions: { invoke: async () => { called = true; } } };
  await assert.rejects(claimGuestTrialForProject(client, projectId,
    { getItem: () => null }), /記録が見つかりません/);
  assert.equal(called, false);
});

test('only the explicitly mapped first prompt becomes the formal childhood answer', () => {
  const questions = [
    { user_question_id: 'formal-1', question_id: 'TY_Q01', chapter: '幼い頃', theme_code: 'ty_theme_childhood', status: 'answered' },
    { user_question_id: 'guest-2', question_id: 'TY_TRIAL_CHILDHOOD02', onboarding_group: 'trial_experience', chapter: '幼い頃', status: 'answered' },
    { user_question_id: 'guest-3', question_id: 'TY_TRIAL_CHILDHOOD03', onboarding_group: 'trial_experience', chapter: '幼い頃', status: 'answered' },
  ];
  const answers = questions.map((question, index) => ({ id: `answer-${index}`, user_question_id: question.user_question_id }));
  const childhood = buildStorySections(questions, answers).find(section => section.chapterTitle === '幼い頃');
  assert.deepEqual(childhood.answers.map(answer => answer.id), ['answer-0', 'answer-1', 'answer-2']);
});
