import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertHelperAnswerVisible,
  assertHelperMediaPathsVisible
} from '../../supabase/functions/_shared/helper-private-access.ts';

function fakeAdmin({ helper = true, answer, media = [], archive = [] }) {
  return {
    rpc: async () => ({ data: helper, error: null }),
    from(table) {
      const query = {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: answer, error: null }; },
        async in() { return { data: table === 'media_assets' ? media : archive, error: null }; }
      };
      return query;
    }
  };
}

test('helper cannot process a private answer through a service-role endpoint', async () => {
  const admin = fakeAdmin({ answer: { book_project_id: 'project', access_override: 'private_forever' } });
  await assert.rejects(assertHelperAnswerVisible(admin, 'project', 'helper', 'answer'), /Forbidden/);
});

test('helper cannot process an archived private recording', async () => {
  const admin = fakeAdmin({
    answer: { book_project_id: 'project', access_override: 'private_forever' },
    archive: [{ answer_id: 'answer', storage_path: 'helper/private.webm' }]
  });
  await assert.rejects(assertHelperMediaPathsVisible(admin, 'project', 'helper', ['helper/private.webm']), /Forbidden/);
});

test('visible answer and its linked photo remain available to a helper', async () => {
  const admin = fakeAdmin({
    answer: { book_project_id: 'project', access_override: 'inherit' },
    media: [{ answer_id: 'answer', book_project_id: 'project', storage_path: 'helper/photo.jpg' }]
  });
  await assert.doesNotReject(assertHelperMediaPathsVisible(admin, 'project', 'helper', ['helper/photo.jpg']));
});
