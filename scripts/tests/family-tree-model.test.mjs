import test from 'node:test';
import assert from 'node:assert/strict';
import { treeNeighbors } from '../../src/lib/familyTreeModel.js';

const people = ['self', 'father', 'mother', 'spouse', 'child', 'sibling', 'grandparent', 'aunt']
  .map(id => ({ id, display_name: id }));
const relations = [
  ['parent_child', 'father', 'self'], ['parent_child', 'mother', 'self'],
  ['parent_child', 'father', 'sibling'], ['spouse', 'self', 'spouse'],
  ['parent_child', 'self', 'child'], ['parent_child', 'spouse', 'child'],
  ['parent_child', 'grandparent', 'father'], ['parent_child', 'grandparent', 'aunt'],
].map(([relation_type, person_a_id, person_b_id], index) =>
  ({ id: String(index), relation_type, person_a_id, person_b_id }));
const ids = items => items.map(item => item.person.id);

test('every center uses its own parents, spouses, siblings, and children', () => {
  const expected = {
    self: { parents: ['father','mother'], spouses: ['spouse'], siblings: ['sibling'], children: ['child'] },
    father: { parents: ['grandparent'], spouses: [], siblings: ['aunt'], children: ['self','sibling'] },
    mother: { parents: [], spouses: [], siblings: [], children: ['self'] },
    spouse: { parents: [], spouses: ['self'], siblings: [], children: ['child'] },
    child: { parents: ['self','spouse'], spouses: [], siblings: [], children: [] },
  };
  for (const [center, groups] of Object.entries(expected)) {
    const actual = treeNeighbors(center, people, relations);
    for (const [group, wanted] of Object.entries(groups)) assert.deepEqual(ids(actual[group]), wanted,
      `${center} ${group}`);
  }
});

test('sharing a child does not invent a spouse relationship', () => {
  assert.deepEqual(ids(treeNeighbors('father', people, relations).spouses), []);
  assert.deepEqual(ids(treeNeighbors('mother', people, relations).spouses), []);
});
