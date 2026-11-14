import test from 'node:test';
import assert from 'node:assert/strict';
import { BookAnswerPhotoDraft } from '../../src/lib/bookAnswerPhotoDraft.js';

test('a failed photo upload keeps its ID for an explicit retry and cannot complete early', async () => {
  const uploaded = [];
  const registered = [];
  let attempt = 0;
  const client = {
    storage: { from: bucket => {
      assert.equal(bucket, 'photos');
      return { upload: async (path) => {
        uploaded.push(path);
        attempt += 1;
        return attempt === 1 ? { error: new Error('offline') } : { error: null };
      } };
    } },
    rpc: async (name, input) => {
      registered.push({ name, input });
      return { data: { status: 'saved', answer_id: 'answer-1' }, error: null };
    },
  };
  const draft = new BookAnswerPhotoDraft({ client, userId: 'user-1', projectId: 'project-1', questionId: 'question-1' });
  const file = { type: 'image/jpeg', size: 1000 };
  await assert.rejects(draft.add(file), /offline/);
  const pendingId = draft.pending.id;
  await assert.rejects(draft.completePhotoOnly(1, []), /写真の保存/);
  const result = await draft.add(file);
  assert.equal(result.id, pendingId);
  assert.equal(uploaded.length, 2);
  assert.equal(uploaded[0], uploaded[1]);
  assert.equal(registered[0].name, 'register_book_answer_photo_draft');
  assert.equal(registered[0].input.input_storage_path, uploaded[0]);
  assert.equal((await draft.completePhotoOnly(1, [result.id])).answer_id, 'answer-1');
});
