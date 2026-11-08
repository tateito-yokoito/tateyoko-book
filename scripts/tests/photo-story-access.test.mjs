import test from 'node:test';
import assert from 'node:assert/strict';
import { photoStoryAccess } from '../../src/lib/photoStoryAccess.js';

const projectId = '477018a1-c197-4764-9b3b-39508383d5f3';
const client = (managed, workspace) => ({
  supabaseUrl: 'https://wquxjeqkumossjxehdop.supabase.co',
  rpc: async (name, args) => {
    if (name === 'family_managed') {
      assert.equal(args.p, projectId);
      return { data: managed, error: null };
    }
    assert.equal(name, 'family_journey');
    assert.equal(args.p, projectId);
    return { data: workspace, error: null };
  },
});

test('ordinary projects retain the existing photo flow', async () => {
  assert.deepEqual(await photoStoryAccess(client(false), projectId), { kind: 'personal' });
});

test('a family creator uses the existing family photo flow in production', async () => {
  const result = await photoStoryAccess(client(true, {
    project_id: projectId, role: 'supporter', can_produce: true, questions: [],
  }), projectId);
  assert.equal(result.kind, 'family');
  assert.equal(result.workspace.project_id, projectId);
  assert.equal(typeof result.api.workspace, 'function');
});

test('a family supporter without production rights cannot open the photo flow', async () => {
  await assert.rejects(photoStoryAccess(client(true, {
    project_id: projectId, role: 'supporter', can_produce: false, questions: [],
  }), projectId));
});

test('database errors never fall back to the owner-only path', async () => {
  await assert.rejects(photoStoryAccess({
    rpc: async () => ({ data: null, error: Error('unavailable') }),
  }, projectId));
});
