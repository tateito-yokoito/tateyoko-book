import test from 'node:test';
import assert from 'node:assert/strict';
import { treeNeighbors, familyRelationSuggestions, relationCandidates } from '../../src/lib/familyTreeModel.js';

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

test('shared parents are proposed, never added as spouses', () => {
  const suggestions = familyRelationSuggestions(people,relations);
  assert.equal(suggestions.some(item => item.kind === 'shared_child_spouse'
    && [item.person_a_id,item.person_b_id].includes('father')
    && [item.person_a_id,item.person_b_id].includes('mother')),true);
  assert.deepEqual(ids(treeNeighbors('father', people, relations).spouses), []);
});

test('a spouse with an unlinked child is proposed once and decisions persist', () => {
  const base = relations.filter(row => !(row.person_a_id === 'spouse' && row.person_b_id === 'child'));
  const proposal = familyRelationSuggestions(people,base).find(item =>
    item.kind === 'spouse_child_parent' && item.person_a_id === 'spouse' && item.person_b_id === 'child');
  assert.ok(proposal);
  const decision = { kind:proposal.kind,person_a_id:proposal.person_a_id,
    person_b_id:proposal.person_b_id,status:'declined' };
  assert.equal(familyRelationSuggestions(people,base,[decision]).some(item => item.key === proposal.key),false);
  assert.equal(familyRelationSuggestions(people,base,[{...decision,status:'later'}])
    .find(item => item.key === proposal.key)?.status,'later');
});

test('relationship picker narrows people after choosing a role without guessing unknown gender', () => {
  const profiles = [...people.map(item => ({ ...item, gender:item.id === 'mother' ? 'female'
    : item.id === 'aunt' ? 'female' : item.id === 'grandparent' ? 'male' : null })),
  {id:'unlinked-man',display_name:'unlinked man',gender:'male'},
  {id:'unlinked-unknown',display_name:'unlinked unknown',gender:null}];
  const self = profiles.find(item => item.id === 'self');
  assert.deepEqual(relationCandidates(self,profiles,relations,'').map(item => item.id),[]);
  const fathers = relationCandidates(self,profiles,relations,'father').map(item => item.id);
  assert.ok(fathers.includes('unlinked-man'));
  assert.ok(fathers.includes('unlinked-unknown'));
  assert.ok(!fathers.includes('aunt'));
  assert.ok(!fathers.includes('grandparent'));
  assert.ok(!fathers.includes('sibling'));
  assert.ok(!fathers.includes('child'));
  const spouses = relationCandidates(self,profiles,relations,'spouse').map(item => item.id);
  assert.ok(!spouses.includes('sibling'));
  assert.ok(!spouses.includes('father'));
  assert.ok(!spouses.includes('spouse'));
});
