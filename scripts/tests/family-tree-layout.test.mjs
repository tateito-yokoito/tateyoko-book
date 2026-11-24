import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutWholeFamily } from '../../src/lib/familyTreeLayout.js';

const people = ['grandfather','grandmother','father','mother','self','sister','partner','child','unlinked']
  .map(id => ({ id, display_name:id }));
const link = (id, type, a, b) => ({ id, relation_type:type, person_a_id:a, person_b_id:b });
const relations = [
  link('g1','spouse','grandfather','grandmother'),
  link('g2','parent_child','grandfather','father'),
  link('g3','parent_child','grandmother','father'),
  link('f1','parent_child','father','self'),
  link('f2','parent_child','mother','self'),
  link('f3','parent_child','father','sister'),
  link('f4','parent_child','mother','sister'),
  link('s1','spouse','self','partner'),
  link('c1','parent_child','self','child'),
  link('c2','parent_child','partner','child'),
];

test('whole family and print plan include every saved person and only saved spouse lines', () => {
  const plan = layoutWholeFamily(people, relations);
  assert.deepEqual(new Set(plan.nodes.map(node => node.person.id)), new Set(people.map(person => person.id)));
  assert.equal(plan.paths.filter(path => path.kind === 'spouse').length, 2);
  assert.ok(!plan.paths.some(path => path.id === 'father:mother'));
  const levels = new Map(plan.nodes.map(node => [node.person.id, node.generation]));
  assert.ok(levels.get('grandfather') < levels.get('father'));
  assert.ok(levels.get('father') < levels.get('self'));
  assert.ok(levels.get('self') < levels.get('child'));
  assert.equal(levels.get('self'), levels.get('partner'));
  assert.ok(plan.paths.some(path => path.id.startsWith('trunk:couple:partner:self')));
});

test('a shared child without a spouse link retains two separate parent trunks', () => {
  const withoutSpouse = relations.filter(row => row.id !== 's1');
  const plan = layoutWholeFamily(people, withoutSpouse);
  assert.ok(plan.paths.some(path => path.id.startsWith('trunk:parent:self')));
  assert.ok(plan.paths.some(path => path.id.startsWith('trunk:parent:partner')));
  assert.ok(!plan.paths.some(path => path.kind === 'spouse' && path.id === 's1'));
});
