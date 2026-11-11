import assert from 'node:assert/strict';
import test from 'node:test';
import { requireExperienceProcessing } from '../../supabase/functions/_shared/experience-access.ts';

const project = '11111111-1111-4111-8111-111111111111';
const question = '22222222-2222-4222-8222-222222222222';
const otherQuestion = '33333333-3333-4333-8333-333333333333';

function adminFor({ unpaid = false, allowed = false, family = false, familyEnabled = true, answerQuestion = question } = {}) {
  const calls = [];
  const admin = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      const values = {
        unpaid_trial_project: unpaid,
        unpaid_trial_question: allowed,
        family_managed: family,
        family_release_actor_allowed: familyEnabled,
        family_assert_operation: family,
        experience_data_allowed: true,
        assert_experience_processing: true,
      };
      return { data: values[name], error: null };
    },
    from: () => ({
      select() { return this; },
      eq() { return this; },
      async maybeSingle() { return { data: { book_project_id: project, user_question_id: answerQuestion }, error: null }; }
    })
  };
  return { admin, calls };
}

test('unpaid trial permits only an included question and checks the saved answer question', async () => {
  const blocked = adminFor({ unpaid: true, allowed: false });
  await assert.rejects(requireExperienceProcessing(blocked.admin, project, 'actor', '', question), /本編は購入後/);
  assert.equal(blocked.calls.some(([name]) => name === 'family_assert_operation'), false);

  const allowed = adminFor({ unpaid: true, allowed: true });
  await assert.doesNotReject(requireExperienceProcessing(allowed.admin, project, 'actor', '', question));
  assert.equal(allowed.calls.some(([name]) => name === 'assert_experience_processing'), true);

  const mismatched = adminFor({ answerQuestion: question });
  await assert.rejects(requireExperienceProcessing(mismatched.admin, project, 'actor', question, otherQuestion), /Forbidden/);
});

test('family release gate rejects an unauthorized actor before family operation', async () => {
  const { admin, calls } = adminFor({ family: true, familyEnabled: false });
  const originalDeno = globalThis.Deno;
  globalThis.Deno = { env: { get: name => ({
    SUPABASE_URL: 'https://wquxjeqkumossjxehdop.supabase.co',
    FAMILY_PRODUCTION_ENABLED: 'true'
  })[name] } };
  try {
    await assert.rejects(requireExperienceProcessing(admin, project, 'actor'), /Family release denied/);
    assert.equal(calls.some(([name]) => name === 'family_assert_operation'), false);
  } finally {
    globalThis.Deno = originalDeno;
  }
});
