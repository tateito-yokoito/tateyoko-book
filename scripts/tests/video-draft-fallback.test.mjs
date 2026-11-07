import assert from 'node:assert/strict';
import test from 'node:test';
import { videoDraft } from '../../src/lib/videoDelivery.js';

test('a rejected IndexedDB write keeps one video draft available for retry in the open page', async () => {
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.error = new Error('IndexedDB unavailable');
        request.onerror();
      });
      return request;
    },
  };
  try {
    const draft = { id: 'video-test', rawVideo: new Blob(['test'], { type: 'video/mp4' }) };
    await videoDraft('put', 'test-user', 'test-project', draft);
    assert.equal((await videoDraft('get', 'test-user', 'test-project')).id, draft.id);
    await videoDraft('put', 'test-user', 'test-project', { ...draft, completed: ['video.mp4'] });
    assert.deepEqual((await videoDraft('get', 'test-user', 'test-project')).completed, ['video.mp4']);
    await videoDraft('delete', 'test-user', 'test-project');
    assert.equal(await videoDraft('get', 'test-user', 'test-project'), null);
  } finally {
    globalThis.indexedDB = previous;
  }
});
