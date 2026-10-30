import assert from 'node:assert/strict';
import test from 'node:test';
import { AnswerTextDraft, draftStorageKey } from '../../src/lib/answerTextDraft.js';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

const identity = { userId: 'user-a', projectId: 'project-a', sequenceOrder: 7 };

function fakeServer() {
  let draft = null;
  let answerRevision = 0;
  let answerBody = '';
  let offline = false;
  let failCommit = false;
  return {
    get draft() { return draft; },
    changeAnswer(body) { answerRevision++; answerBody = body; },
    set offline(value) { offline = value; },
    set failCommit(value) { failCommit = value; },
    from(table) {
      return { select: () => ({ eq: () => ({ eq: () => ({
        maybeSingle: async () => offline ? { error: new Error('offline') }
          : { data: table === 'answers'
            ? { transcript_edited: answerBody, text_revision: answerRevision }
            : draft ? { ...draft, book_project_id: identity.projectId } : null },
      }) }) }) };
    },
    async rpc(name, args) {
      if (offline) return { error: new Error('offline') };
      if (name === 'sync_answer_text_draft') {
        if (!draft) draft = { state: 'discarded', generation: 0, edit_number: 0,
          device_id: args.input_device_id, body: null, base_text_revision: 0 };
        if (draft.generation !== args.input_generation) return { data: { status: 'generation_conflict', draft } };
        if (draft.edit_number !== args.input_expected_server_edit_number) return { data: { status: 'edit_conflict', draft } };
        if (draft.state === 'active' && draft.device_id !== args.input_device_id) return { data: { status: 'device_conflict', draft } };
        draft = { ...draft, state: 'active', body: args.input_body,
          edit_number: args.input_edit_number, device_id: args.input_device_id,
          base_text_revision: args.input_base_text_revision };
        return { data: { status: 'saved', draft } };
      }
      if (name === 'discard_answer_text_draft') {
        if (!draft) draft = { state: 'discarded', generation: 0, edit_number: 0,
          device_id: args.input_device_id, body: null };
        if (draft.generation !== args.input_generation) return { data: { status: 'generation_conflict', draft } };
        if (draft.state === 'active' && draft.device_id !== args.input_device_id) return { data: { status: 'device_conflict', draft } };
        draft = { ...draft, state: 'discarded', body: null, generation: draft.generation + 1,
          edit_number: 0, device_id: args.input_device_id };
        return { data: { status: 'discarded', draft } };
      }
      if (name === 'discard_conflicted_answer_text_draft') {
        if (!draft || draft.generation !== args.input_generation
          || draft.edit_number !== args.input_remote_edit_number) return { data: { status: 'conflict', draft } };
        draft = { ...draft, state: 'discarded', body: null, generation: draft.generation + 1,
          edit_number: 0, device_id: args.input_device_id };
        return { data: { status: 'discarded', draft } };
      }
      if (name === 'save_answer_text') {
        if (failCommit) return { error: new Error('save failed') };
        if (!draft || draft.body !== args.input_body || draft.edit_number !== args.input_edit_number) {
          return { data: { status: 'draft_conflict' } };
        }
        if (answerRevision !== args.input_base_text_revision) {
          return { data: { status: 'answer_conflict', answer_revision: answerRevision } };
        }
        answerRevision++;
        answerBody = args.input_body;
        draft = { ...draft, state: 'discarded', body: null, generation: draft.generation + 1,
          edit_number: 0 };
        return { data: { status: 'saved', text_revision: answerRevision,
          generation: draft.generation, answer_id: 'answer-a' } };
      }
      if (name === 'resolve_answer_text_draft_conflict') {
        if (!draft || draft.generation !== args.input_generation
          || draft.edit_number !== args.input_remote_edit_number) return { data: { status: 'conflict', draft } };
        draft = { ...draft, state: 'active', body: args.input_body,
          edit_number: draft.edit_number + 1, device_id: args.input_device_id };
        return { data: { status: 'saved', draft } };
      }
      if (name === 'rebase_conflicted_answer_text_draft') {
        if (!draft || draft.generation !== args.input_generation
          || draft.edit_number !== args.input_edit_number
          || answerRevision !== args.input_answer_revision) {
          return { data: { status: 'answer_conflict', answer_revision: answerRevision } };
        }
        draft = { ...draft,
          body: args.input_choice === 'local' ? draft.body : answerBody,
          base_text_revision: answerRevision,
          generation: draft.generation + 1, edit_number: draft.edit_number + 1 };
        return { data: { status: 'saved', draft, answer_revision: answerRevision } };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
}

function session(server, storage) {
  return new AnswerTextDraft({ client: server, storage, ...identity, debounceMs: 10000 });
}

test('each keystroke survives reload and an offline server', async () => {
  const server = fakeServer();
  const storage = new MemoryStorage();
  const first = session(server, storage);
  await first.open();
  first.change('父との思い出');
  server.offline = true;
  await assert.rejects(first.flush());
  first.dispose();
  const reopened = session(server, storage);
  await reopened.open();
  assert.equal(reopened.snapshot().body, '父との思い出');
  assert.equal(reopened.snapshot().remoteStatus, 'offline');
  reopened.dispose();
});

test('explicit offline discard keeps a tombstone and rejects an old sync', async () => {
  const server = fakeServer();
  const storage = new MemoryStorage();
  const draft = session(server, storage);
  await draft.open();
  draft.change('消す文章');
  const old = { ...draft.snapshot() };
  await draft.flush();
  server.offline = true;
  await draft.discard();
  assert.equal(draft.snapshot().body, null);
  assert.equal(draft.snapshot().state, 'discard_pending');
  const reopened = session(server, storage);
  await reopened.open();
  assert.equal(reopened.snapshot().body, null);
  server.offline = false;
  await reopened.retryDiscard();
  assert.equal(server.draft.state, 'discarded');
  assert.equal(server.draft.generation, old.generation + 1);
  const late = await server.rpc('sync_answer_text_draft', {
    input_generation: old.generation, input_edit_number: old.editNumber + 1,
    input_expected_server_edit_number: old.editNumber,
    input_device_id: old.deviceId, input_body: '古い文章',
  });
  assert.equal(late.data.status, 'generation_conflict');
  assert.equal(server.draft.body, null);
  assert.equal(storage.getItem(draftStorageKey(...Object.values(identity))), null);
  draft.dispose(); reopened.dispose();
});

test('save failure retains the draft; success clears it after acknowledgement', async () => {
  const server = fakeServer();
  const storage = new MemoryStorage();
  const draft = session(server, storage);
  await draft.open();
  draft.change('残す文章');
  server.failCommit = true;
  await assert.rejects(draft.save());
  assert.equal(JSON.parse(storage.getItem(draft.key)).body, '残す文章');
  server.failCommit = false;
  const saved = await draft.save();
  assert.equal(saved.status, 'saved');
  assert.equal(storage.getItem(draft.key), null);
  draft.dispose();
});

test('two devices keep both texts until an explicit choice', async () => {
  const server = fakeServer();
  const left = session(server, new MemoryStorage());
  const right = session(server, new MemoryStorage());
  await left.open(); await right.open();
  left.change('左の文章');
  await left.flush();
  right.change('右の文章');
  await right.flush();
  assert.equal(right.snapshot().remoteStatus, 'conflict');
  assert.equal(right.snapshot().body, '右の文章');
  assert.equal(right.snapshot().conflict.body, '左の文章');
  await right.resolveConflict('local');
  assert.equal(server.draft.body, '右の文章');
  left.dispose(); right.dispose();
});

test('discard on one device asks before removing a newer draft on another', async () => {
  const server = fakeServer();
  const left = session(server, new MemoryStorage());
  const right = session(server, new MemoryStorage());
  await left.open(); await right.open();
  left.change('左の文章');
  await left.flush();
  await right.discard();
  assert.equal(right.snapshot().state, 'discard_pending');
  assert.equal(right.snapshot().conflict.body, '左の文章');
  assert.equal(server.draft.body, '左の文章');
  await right.resolveConflict('local');
  assert.equal(server.draft.body, null);
  assert.equal(right.snapshot().remoteStatus, 'discarded');
  left.dispose(); right.dispose();
});

test('a local unsynced edit can be chosen after another device discards', async () => {
  const server = fakeServer();
  const left = session(server, new MemoryStorage());
  const right = session(server, new MemoryStorage());
  await left.open(); await right.open();
  right.change('残したい文章');
  await left.discard();
  await right.flush();
  assert.equal(right.snapshot().remoteStatus, 'conflict');
  assert.equal(right.snapshot().conflict.state, 'discarded');
  await right.resolveConflict('local');
  assert.equal(server.draft.body, '残したい文章');
  left.dispose(); right.dispose();
});

test('a newer confirmed answer is compared before the older draft can replace it', async () => {
  const server = fakeServer();
  const storage = new MemoryStorage();
  const draft = session(server, storage);
  await draft.open();
  draft.change('この端末で書いた文章');
  await draft.flush();
  server.changeAnswer('別の端末で確定した文章');
  await assert.rejects(draft.save());
  assert.equal(draft.snapshot().conflict.kind, 'answer');
  assert.equal(draft.snapshot().conflict.body, '別の端末で確定した文章');
  assert.equal(JSON.parse(storage.getItem(draft.key)).body, 'この端末で書いた文章');
  await draft.resolveConflict('local');
  assert.equal(draft.snapshot().body, 'この端末で書いた文章');
  assert.equal(draft.snapshot().baseTextRevision, 1);
  assert.equal((await draft.save()).status, 'saved');
  draft.dispose();
});
